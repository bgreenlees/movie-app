// Watch Together "Tonight for you both": the pair candidate pool.
// Spec: docs/specs/watch-together-decide.md §4 (one catalogue), §5.1 (scoring),
// §5.2 (sources), §5.5 (privacy), §5.6 (API), §6 (caps).
//
// Pure: no database or network. The route loads both people's entries from
// Prisma and passes TMDB in as `fetchers` (wrapped in its own limiter), so this
// file only decides what goes in the pool and in what order.
//
// Movies and TV are one catalogue (§4). Nothing here gives a media type a
// quota, a slot or a turn: the type only picks which TMDB endpoint or genre
// table to use. The movie/TV mix of the pool is whatever the traits produce.

import { z } from "zod";
import {
  blendPools,
  candidateKey,
  filterByRealRuntime,
  fitsRuntime,
  matchesDiscoverParams,
  moodToDiscoverParams,
  traitScore,
  type MediaType,
  type MoodCandidate,
  type MoodSelection,
  type TitleFacts,
} from "./moodPicker";
import { affinity, buildTasteProfile, pairScore, sourceBoost, type TasteStatus } from "./pairTaste";
import { canonicalProviderIds } from "./providers";

// ── Caps (§5.2, §6 F1) ───────────────────────────────────────────────────────

/** B: most recent want-list titles per person, beyond the shared ones */
export const ONE_SIDED_WANTS_PER_PERSON = 15;
/** C: each person's most recent Loves used as recommendation seeds (≤ 6 rec calls) */
export const REC_SEEDS_PER_PERSON = 3;
/** C: recommendations kept, best seed count first */
export const REC_POOL_SIZE = 30;
/** D: discover pages per media type (2 × 2 = 4 discover calls) */
export const DISCOVER_PAGES = [1, 2] as const;
/** D: size of the blended discover pool */
export const DISCOVER_POOL_SIZE = 40;
/**
 * Title-details lookups per request (each is 24 h cached by the TMDB client),
 * shared out by source so no source can starve another: want lists first,
 * then recommendations, then discover movies. A share a source doesn't use
 * rolls on to the next.
 */
export const FACTS_SHARES = { wants: 12, recs: 8, discover: 10 } as const;
export const FACTS_BUDGET = FACTS_SHARES.wants + FACTS_SHARES.recs + FACTS_SHARES.discover;
/** Size of the ranked pool returned to the client */
export const PAIR_POOL_SIZE = 60;

const MEDIA_TYPES: readonly MediaType[] = ["movie", "tv"];

// ── Inputs ───────────────────────────────────────────────────────────────────

/** One row of a person's movie or TV watchlist, with the cached title data. */
export interface PoolEntry {
  mediaType: MediaType;
  tmdbId: number;
  status: TasteStatus;
  rating?: number | null;
  /** When it was added (ms since epoch); "most recent" means highest */
  addedAt: number;
  title: string;
  posterPath: string | null;
  /** Release or first-air date, YYYY-MM-DD */
  date: string | null;
  overview?: string | null;
  /** From the cached `Movie.genres` / `TVShow.genres` */
  genreIds: number[];
}

export interface PoolPerson {
  entries: readonly PoolEntry[];
  /** Saved streaming services (canonicalised here) */
  providerIds: readonly number[];
}

/** What `tmdb.getTitleMoodFacts` returns */
export interface FullTitleFacts extends TitleFacts {
  id: number;
  title: string;
  posterPath: string | null;
  date: string;
  overview: string;
  popularity: number;
  voteCount: number;
}

export interface PoolFetchers {
  /** Details + US subscription providers for one title */
  facts(media: MediaType, id: number): Promise<FullTitleFacts>;
  /** TMDB recommendations for a seed title (same media type as the seed) */
  recommendations(media: MediaType, id: number): Promise<MoodCandidate[]>;
  /** One discover page with prebuilt params, plus TMDB's total match count */
  discover(
    media: MediaType,
    params: Record<string, string>,
    page: number
  ): Promise<{ total: number; candidates: MoodCandidate[] }>;
}

export interface PairPoolInput {
  me: PoolPerson;
  partner: PoolPerson;
  /** Partner's display name for reasons; null → "your friend" */
  partnerName: string | null;
  /** `media` is ignored: the pair pool is always movies and TV */
  selection: MoodSelection;
  /** "Only services we both have" */
  sharedOnly: boolean;
  today: Date;
  fetchers: PoolFetchers;
  /** Told about each failed fetch; the pool is built from whatever succeeded */
  onError?: (what: string, error: unknown) => void;
  /** Titles returned; defaults to PAIR_POOL_SIZE (tests use a smaller pool) */
  poolSize?: number;
  /**
   * Also write each title's reason from the partner's point of view, naming
   * the caller as this. Decide sessions show one shortlist on both phones, so
   * each person needs their own wording ("On your list" vs "On Sam's list").
   * Omit it (the picks route does) and `partnerReason` is left out.
   */
  partnerView?: { myName: string | null };
}

// ── Output ───────────────────────────────────────────────────────────────────

export type PairCandidate = MoodCandidate & {
  /**
   * 0–1, 1 = best: the title's rank in the pool, `(n − i) / n`. The §5.1 score
   * decides the order but is never returned, since it could be solved back
   * into the partner's affinity (see buildPairPool).
   */
  pairScore: number;
  /** One privacy-safe line (§5.5): only lists and Loves, never a dislike */
  reason: string;
  onMyList: boolean;
  /** `reason` as the partner should read it; only with `partnerView` */
  partnerReason?: string;
  /** Subscription providers, when a details lookup was made */
  providerIds?: number[];
};

export interface PairPoolResult {
  pool: PairCandidate[];
  services: ServicesState;
  coldStart: { me: boolean; partner: boolean };
  /** Every discover call failed (the route may treat an empty pool as an error) */
  discoverFailed: boolean;
  /** Some TMDB calls failed but titles survived: the UI can say "some picks couldn't load" */
  partial: boolean;
}

// ── Query validation (§5.6, §6 F5) ───────────────────────────────────────────

const flag = z
  .enum(["0", "1"])
  .optional()
  .transform((v) => v === "1");

/**
 * `GET /api/watch-together/[userId]/picks?vibe=&time=&fresh=&services=&sharedOnly=`
 * Missing params take defaults; a present but invalid value is a 400, not a
 * silent fallback (F5). Unknown keys are stripped. `media` is accepted for
 * links shared with What to Watch, and ignored.
 */
export const pairPicksQuerySchema = z
  .object({
    vibe: z.enum(["any", "light", "heavy", "intense"]).default("any"),
    time: z.enum(["any", "30", "120"]).default("any"),
    fresh: flag,
    services: flag,
    sharedOnly: flag,
    media: z.enum(["movie", "tv", "both"]).optional(),
  })
  .transform((q): { selection: MoodSelection; sharedOnly: boolean } => ({
    selection: {
      vibe: q.vibe,
      time: q.time,
      fresh: q.fresh,
      onMyServices: q.services,
      media: "both",
    },
    sharedOnly: q.sharedOnly,
  }));

/** Parse URL search params; repeated keys are a 400 too, since they're ambiguous. */
export function parsePairPicksQuery(params: URLSearchParams) {
  const raw: Record<string, string> = {};
  for (const [k, v] of params) {
    if (k in raw) return { success: false as const };
    raw[k] = v;
  }
  const parsed = pairPicksQuerySchema.safeParse(raw);
  return parsed.success ? { success: true as const, data: parsed.data } : { success: false as const };
}

// ── Services (§5.2, §12 decision 2) ──────────────────────────────────────────

export type ServicesMode = "union" | "shared" | "mine" | "partners" | "none";

export interface ServicesState {
  mine: boolean;
  partners: boolean;
  /** Services both have (canonical ids), for the "Only services we both have" toggle */
  shared: number[];
}

/**
 * Which services "On our services" means. Union by default; the intersection
 * with `sharedOnly`. If only one person has saved services, theirs are used
 * either way. If neither has, there's nothing to filter by ("none").
 */
export function resolveServices(
  mine: readonly number[],
  partners: readonly number[],
  sharedOnly: boolean
): { mode: ServicesMode; providerIds: number[]; state: ServicesState } {
  const a = canonicalProviderIds([...mine]);
  const b = canonicalProviderIds([...partners]);
  const bSet = new Set(b);
  const shared = a.filter((id) => bSet.has(id));
  const state = { mine: a.length > 0, partners: b.length > 0, shared };
  if (a.length === 0 && b.length === 0) return { mode: "none", providerIds: [], state };
  if (b.length === 0) return { mode: "mine", providerIds: a, state };
  if (a.length === 0) return { mode: "partners", providerIds: b, state };
  if (sharedOnly) return { mode: "shared", providerIds: shared, state };
  return { mode: "union", providerIds: [...new Set([...a, ...b])], state };
}

// ── Excludes (§5.2) ──────────────────────────────────────────────────────────

/** Watched, watching or not interested, by either person: never in the pool. */
export function excludedKeys(...people: readonly PoolPerson[]): Set<string> {
  const out = new Set<string>();
  for (const p of people) {
    for (const e of p.entries) {
      if (e.status !== "WANT_TO_WATCH") out.add(candidateKey({ id: e.tmdbId, mediaType: e.mediaType }));
    }
  }
  return out;
}

// ── Building the pool ────────────────────────────────────────────────────────

type Who = "me" | "partner";

interface Draft {
  c: MoodCandidate;
  wantedBy: Set<Who>;
  /** Title of the first Love of each person that recommended this */
  seededBy: Partial<Record<Who, string>>;
  providerIds?: number[];
}

const entryKey = (e: PoolEntry) => candidateKey({ id: e.tmdbId, mediaType: e.mediaType });
const byRecent = (a: PoolEntry, b: PoolEntry) => b.addedAt - a.addedAt;

function entryCandidate(e: PoolEntry): MoodCandidate {
  return {
    id: e.tmdbId,
    mediaType: e.mediaType,
    title: e.title,
    posterPath: e.posterPath,
    date: e.date ?? "",
    overview: e.overview ?? "",
    popularity: 0,
    voteAverage: 0,
    genreIds: e.genreIds,
  };
}

function factsCandidate(media: MediaType, f: FullTitleFacts): MoodCandidate {
  return {
    id: f.id,
    mediaType: media,
    title: f.title,
    posterPath: f.posterPath,
    date: f.date,
    overview: f.overview,
    popularity: f.popularity,
    voteAverage: f.voteAverage,
    voteCount: f.voteCount,
    genreIds: f.genreIds,
  };
}

/** Facts for a title we have no details for: runtime and providers unknown. */
function looseFacts(c: MoodCandidate): TitleFacts {
  return {
    genreIds: c.genreIds ?? [],
    runtime: null,
    date: c.date || null,
    voteAverage: c.voteAverage,
    providerIds: [],
  };
}

/**
 * Build the ranked pair pool: sources A–D (§5.2), the excludes, the mood
 * filter, the services filter, the §5.1 score and a reason per title.
 */
export async function buildPairPool(input: PairPoolInput): Promise<PairPoolResult> {
  const { me, partner, sharedOnly, today, fetchers } = input;
  const onError = input.onError ?? (() => {});
  const poolSize = input.poolSize ?? PAIR_POOL_SIZE;
  const people: Record<Who, PoolPerson> = { me, partner };

  const profiles = {
    me: buildTasteProfile(me.entries),
    partner: buildTasteProfile(partner.entries),
  };
  const coldStart = { me: profiles.me.coldStart, partner: profiles.partner.coldStart };

  const services = resolveServices(me.providerIds, partner.providerIds, sharedOnly);
  const servicesOn = input.selection.onMyServices && services.mode !== "none";
  const selection: MoodSelection = { ...input.selection, onMyServices: servicesOn, media: "both" };

  // "Only services we both have" with nothing in common: nothing can qualify.
  // (moodToDiscoverParams would otherwise drop the filter for an empty list.)
  if (servicesOn && services.providerIds.length === 0) {
    return { pool: [], services: services.state, coldStart, discoverFailed: false, partial: false };
  }

  const ctx = { today, providerIds: services.providerIds };
  const paramsFor: Record<MediaType, Record<string, string>> = {
    movie: moodToDiscoverParams(selection, "movie", ctx),
    tv: moodToDiscoverParams(selection, "tv", ctx),
  };
  // Runtime and providers only come from a details lookup; genres, date and
  // poster are already cached. So titles that aren't from discover need one
  // only when time or services are on.
  const needsFacts = selection.time !== "any" || servicesOn;

  const exclude = excludedKeys(me, partner);

  // Details lookups: one per title, shared across sources, within FACTS_BUDGET.
  // Reservations are made synchronously in priority order, so which titles get
  // checked is deterministic however the network answers.
  // `cap` is cumulative: the total used so far may not pass it. Returns null
  // when over budget, so callers decide what an unchecked title means.
  const factsCache = new Map<string, Promise<FullTitleFacts>>();
  let factsUsed = 0;
  let tmdbFailures = 0;
  // One lookup per title per request, cached; failures are logged and counted.
  const factsFor = (media: MediaType, id: number): Promise<FullTitleFacts> => {
    const key = candidateKey({ id, mediaType: media });
    const cached = factsCache.get(key);
    if (cached) return cached;
    const p = fetchers.facts(media, id).catch((error) => {
      tmdbFailures++;
      onError(`details for ${key}`, error);
      throw error;
    });
    p.catch(() => {}); // handled by whoever awaits it
    factsCache.set(key, p);
    return p;
  };
  const reserveFacts = (media: MediaType, id: number, cap: number): Promise<FullTitleFacts> | null => {
    const cached = factsCache.get(candidateKey({ id, mediaType: media }));
    if (cached) return cached;
    if (factsUsed >= cap) return null;
    factsUsed++;
    return factsFor(media, id);
  };

  const drafts = new Map<string, Draft>();
  const add = (c: MoodCandidate, extra?: { wantBy?: Who; seed?: [Who, string]; providerIds?: number[] }) => {
    const key = candidateKey(c);
    if (exclude.has(key)) return;
    let d = drafts.get(key);
    if (!d) {
      d = { c, wantedBy: new Set(), seededBy: {} };
      drafts.set(key, d);
    } else if ((d.c.voteCount ?? 0) === 0 && (c.voteCount ?? 0) > 0) {
      d.c = c; // prefer the richer TMDB data over the cached row
    }
    if (extra?.wantBy) d.wantedBy.add(extra.wantBy);
    if (extra?.seed && !d.seededBy[extra.seed[0]]) d.seededBy[extra.seed[0]] = extra.seed[1];
    if (extra?.providerIds) d.providerIds = extra.providerIds;
  };

  // ── A and B: want lists ──
  const wants: Record<Who, PoolEntry[]> = {
    me: me.entries.filter((e) => e.status === "WANT_TO_WATCH" && !exclude.has(entryKey(e))).sort(byRecent),
    partner: partner.entries
      .filter((e) => e.status === "WANT_TO_WATCH" && !exclude.has(entryKey(e)))
      .sort(byRecent),
  };
  const wantKeys = { me: new Set(wants.me.map(entryKey)), partner: new Set(wants.partner.map(entryKey)) };
  const both = wants.me.filter((e) => wantKeys.partner.has(entryKey(e))); // A: all
  const oneSided: Record<Who, PoolEntry[]> = {
    me: wants.me.filter((e) => !wantKeys.partner.has(entryKey(e))).slice(0, ONE_SIDED_WANTS_PER_PERSON),
    partner: wants.partner.filter((e) => !wantKeys.me.has(entryKey(e))).slice(0, ONE_SIDED_WANTS_PER_PERSON),
  };
  // Priority for lookups: A, then B alternating between the two people by recency.
  const wantOrder: { e: PoolEntry; by: Who[] }[] = both.map((e) => ({ e, by: ["me", "partner"] as Who[] }));
  for (let i = 0; i < ONE_SIDED_WANTS_PER_PERSON; i++) {
    if (oneSided.me[i]) wantOrder.push({ e: oneSided.me[i], by: ["me"] });
    if (oneSided.partner[i]) wantOrder.push({ e: oneSided.partner[i], by: ["partner"] });
  }
  const wantChecks = wantOrder.map(({ e, by }) => {
    // Over budget → `undefined`: it needed a check and didn't get one
    const facts = needsFacts ? reserveFacts(e.mediaType, e.tmdbId, FACTS_SHARES.wants) ?? undefined : null;
    return { e, by, facts };
  });

  // ── C and D: TMDB calls, in parallel with the want-list lookups ──
  // Seeds alternate between the two people (my 1st, their 1st, my 2nd…), so
  // neither person's Loves get first claim on the recommendation slots.
  const lovesOf = (who: Who) =>
    people[who].entries.filter((e) => e.rating === 3).sort(byRecent).slice(0, REC_SEEDS_PER_PERSON);
  const myLoves = lovesOf("me");
  const theirLoves = lovesOf("partner");
  const seeds: { who: Who; e: PoolEntry }[] = [];
  for (let i = 0; i < REC_SEEDS_PER_PERSON; i++) {
    if (myLoves[i]) seeds.push({ who: "me", e: myLoves[i] });
    if (theirLoves[i]) seeds.push({ who: "partner", e: theirLoves[i] });
  }
  const recCalls = Promise.allSettled(
    seeds.map(({ e }) => fetchers.recommendations(e.mediaType, e.tmdbId))
  );
  const discoverCalls = Promise.all(
    MEDIA_TYPES.map(async (media) => {
      const pages = await Promise.allSettled(
        DISCOVER_PAGES.map((page) => fetchers.discover(media, paramsFor[media], page))
      );
      const ok = pages.flatMap((r, i) => {
        if (r.status === "fulfilled") return [r.value];
        tmdbFailures++;
        onError(`discover ${media} page ${DISCOVER_PAGES[i]}`, r.reason);
        return [];
      });
      return ok.length === 0 ? null : { total: ok[0].total, candidates: ok.flatMap((p) => p.candidates) };
    })
  );

  // Want-list titles that pass the mood (and, with facts, time and services).
  for (const { e, by, facts } of wantChecks) {
    if (facts === undefined) continue; // needed a check, over budget: can't vouch for runtime / services
    let candidate = entryCandidate(e);
    let tf = looseFacts(candidate);
    let providerIds: number[] | undefined;
    if (facts) {
      try {
        const f = await facts;
        candidate = { ...factsCandidate(e.mediaType, f), posterPath: f.posterPath ?? e.posterPath };
        tf = f;
        providerIds = f.providerIds;
      } catch {
        continue; // over budget or failed: can't vouch for its runtime / services
      }
    }
    if (!matchesDiscoverParams(paramsFor[e.mediaType], tf)) continue;
    for (const who of by) add(candidate, { wantBy: who, providerIds });
  }

  // C: rank recommendations by how many people's Loves led to them, then by
  // how many seeds, then by their best position in any seed's list, with the
  // seeds interleaved. Ordering by first appearance would let the first seeds
  // (the viewer's, before the interleave) fill every slot.
  const recResults = await recCalls;
  const recs = new Map<string, { c: MoodCandidate; by: Partial<Record<Who, string>>; hits: number; order: number }>();
  recResults.forEach((r, i) => {
    const { who, e } = seeds[i];
    if (r.status === "rejected") {
      tmdbFailures++;
      onError(`recommendations for ${entryKey(e)}`, r.reason);
      return;
    }
    r.value.forEach((c, position) => {
      const key = candidateKey(c);
      if (exclude.has(key)) return;
      const order = position * seeds.length + i;
      const rec = recs.get(key) ?? { c, by: {}, hits: 0, order };
      rec.order = Math.min(rec.order, order);
      rec.hits++;
      if (!rec.by[who]) rec.by[who] = e.title;
      recs.set(key, rec);
    });
  });
  const topRecs = [...recs.values()]
    .sort(
      (a, b) =>
        Object.keys(b.by).length - Object.keys(a.by).length || b.hits - a.hits || a.order - b.order
    )
    .slice(0, REC_POOL_SIZE);

  // D: the mood picker's discover pool.
  const groups = (await discoverCalls).filter((g): g is NonNullable<typeof g> => g !== null);
  const discoverFailed = groups.length === 0;
  const blended = blendPools(groups, DISCOVER_POOL_SIZE).filter((c) => !exclude.has(candidateKey(c)));

  // Second wave of lookups, after the want lists: recs (when time or services
  // are on) then discover movies (runtime, when time is on; discover's movie
  // runtime filter is leaky). Reserved now, in that order, each within its share.
  const recFacts = topRecs.map((r) =>
    needsFacts ? reserveFacts(r.c.mediaType, r.c.id, FACTS_SHARES.wants + FACTS_SHARES.recs) ?? undefined : null
  );
  const discoverMovies = blended.filter((c) => c.mediaType === "movie");
  const movieFacts = discoverMovies.map((c) =>
    selection.time !== "any" ? reserveFacts("movie", c.id, FACTS_BUDGET) : null
  );

  for (let i = 0; i < topRecs.length; i++) {
    const { c, by } = topRecs[i];
    let tf = looseFacts(c);
    let providerIds: number[] | undefined;
    const facts = recFacts[i];
    if (facts === undefined) continue; // needed a check, over budget: can't vouch for runtime / services
    if (facts) {
      try {
        const f = await facts;
        tf = f;
        providerIds = f.providerIds;
      } catch {
        continue;
      }
    }
    if (!matchesDiscoverParams(paramsFor[c.mediaType], tf)) continue;
    for (const who of Object.keys(by) as Who[]) add(c, { seed: [who, by[who]!], providerIds });
  }

  // Discover movies: drop one only when a real lookup shows its runtime breaks
  // the limit. One that's over budget, or whose lookup failed, keeps TMDB's
  // own with_runtime filter, as discover TV always does. Otherwise a busy
  // pair would lose every discover movie to the budget while discover TV
  // passed, a type skew from an implementation detail (§4).
  const checked = discoverMovies.filter((_, i) => movieFacts[i]);
  const checkedFacts = new Map(checked.map((c) => [candidateKey(c), movieFacts[discoverMovies.indexOf(c)]!]));
  const runtimeOk = new Set(
    (
      await filterByRealRuntime(checked, paramsFor.movie, (c) =>
        checkedFacts.get(candidateKey(c))!.then(
          (f) => f.runtime,
          // A failed lookup is no evidence against the title: trust discover
          () => Number(paramsFor.movie["with_runtime.lte"])
        )
      )
    ).map(candidateKey)
  );
  const checkedKeys = new Set(checkedFacts.keys());
  for (const c of blended) {
    const key = candidateKey(c);
    if (c.mediaType === "movie" && checkedKeys.has(key) && !runtimeOk.has(key)) continue;
    add(c);
  }

  // ── Score and explain ──
  const ranked = [...drafts.values()]
    // Posterless titles look broken on a card, except one you both want:
    // that's the strongest signal there is, and the UI shows a placeholder
    // (posterPath: null).
    .filter((d) => d.c.posterPath || d.wantedBy.size === 2)
    .map((d) => {
      const wantedBy = d.wantedBy.size as 0 | 1 | 2;
      const recSeededBy = Object.keys(d.seededBy).length as 0 | 1 | 2;
      const score = pairScore({
        affinityA: affinity(profiles.me, { ...d.c, onWantList: d.wantedBy.has("me") }),
        affinityB: affinity(profiles.partner, { ...d.c, onWantList: d.wantedBy.has("partner") }),
        traitScore: traitScore(d.c, selection),
        sourceBoost: sourceBoost({ wantedBy, recSeededBy }),
      });
      return { d, score, key: candidateKey(d.c) };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  // With a time limit, verify what we return, not every candidate: every
  // movie in the final pool gets a real runtime check (cached; free for
  // titles already checked above). Unchecked discover movies were let through
  // on TMDB's with_runtime filter, which is leaky for movies (a 167-minute
  // film under "Under 2 hrs"). A violator, or a failed lookup, is dropped and
  // the pool refilled once from the next-ranked titles, which are checked the
  // same way. So at most 2 × poolSize lookups, nearly all cache hits.
  // TV episode lengths from TMDB have held up (as in the mood picker).
  const fitsFinal = async ({ d }: (typeof ranked)[number]) => {
    if (d.c.mediaType !== "movie") return true;
    try {
      return fitsRuntime(paramsFor.movie, (await factsFor("movie", d.c.id)).runtime);
    } catch {
      return false; // can't vouch for it
    }
  };
  const keepFitting = async (items: typeof ranked) => {
    const ok = await Promise.all(items.map(fitsFinal));
    return items.filter((_, i) => ok[i]);
  };
  let finalRanked = ranked.slice(0, poolSize);
  if (selection.time !== "any") {
    finalRanked = await keepFitting(finalRanked);
    const short = Math.min(poolSize, ranked.length) - finalRanked.length;
    if (short > 0) {
      // Refill ranks below everything already kept, so appending keeps the order
      finalRanked.push(...(await keepFitting(ranked.slice(poolSize, poolSize + short))));
    }
  }

  // The exact score is never returned. The caller knows their own affinity and
  // every other term (traitScore and sourceBoost use only public fields), so
  // the raw number could be solved for the partner's affinity, and from many
  // titles their taste weights, dislikes included (§5.5; security review on
  // this PR). Only the rank is exposed: (n − i) / n, 1 for the best.
  const pool = finalRanked.map(({ d }, i): PairCandidate => {
    const out: PairCandidate = {
      ...d.c,
      pairScore: rankWeight(i, finalRanked.length),
      reason: reasonFor(d, input.partnerName, selection),
      onMyList: d.wantedBy.has("me"),
    };
    if (input.partnerView) {
      out.partnerReason = reasonFor(mirrorDraft(d), input.partnerView.myName, selection);
    }
    if (d.providerIds) out.providerIds = d.providerIds;
    return out;
  });

  const partial = tmdbFailures > 0 && pool.length > 0;
  return { pool, services: services.state, coldStart, discoverFailed, partial };
}

/** The same title seen from the partner's side: "me" and "partner" swap. */
function mirrorDraft(d: Pick<Draft, "c" | "wantedBy" | "seededBy">) {
  const swap = (w: Who): Who => (w === "me" ? "partner" : "me");
  return {
    c: d.c,
    wantedBy: new Set([...d.wantedBy].map(swap)),
    seededBy: { me: d.seededBy.partner, partner: d.seededBy.me },
  };
}

/** Rank-only weight for position `i` of `n`, rounded to 3 decimals. */
export function rankWeight(i: number, n: number): number {
  return n === 0 ? 0 : Math.round(((n - i) / n) * 1000) / 1000;
}

// ── Reasons (§5.5) ───────────────────────────────────────────────────────────

/** "a light" / "an intense": picks the article from the next word's first letter. */
export function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? "an" : "a"} ${word}`;
}

const VIBE_WORDS: Record<Exclude<MoodSelection["vibe"], "any">, string> = {
  light: "light",
  heavy: "heavy",
  intense: "intense",
};

/**
 * One line on why a title is here. Built only from things the partner may
 * see (§5.5): want lists, Loves, and the title's own rating or the mood. It
 * never uses dislikes, not-interested, the taste profile or affinity, so a
 * reason can't reveal what either person disliked.
 */
export function reasonFor(
  d: Pick<Draft, "c" | "wantedBy" | "seededBy">,
  partnerName: string | null,
  selection: MoodSelection
): string {
  const name = partnerName?.trim() || "your friend";
  const mine = d.wantedBy.has("me");
  const theirs = d.wantedBy.has("partner");
  if (mine && theirs) return "On both your lists";
  if (mine) return "On your list";
  if (theirs) return `On ${name}'s list`;

  const { me: myLove, partner: theirLove } = d.seededBy;
  if (myLove && theirLove) {
    return myLove === theirLove
      ? `Because you both loved ${myLove}`
      : `Because you loved ${myLove} and ${name} loved ${theirLove}`;
  }
  if (myLove) return `Because you loved ${myLove}`;
  if (theirLove) return `Because ${name} loved ${theirLove}`;

  if (selection.vibe !== "any") return `Fits ${withArticle(VIBE_WORDS[selection.vibe])} night`;
  if (d.c.voteAverage >= 7.5 && (d.c.voteCount ?? 0) >= 300) return "Highly rated";
  return "Popular right now";
}
