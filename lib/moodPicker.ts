// "What to watch next" mood picker — pure logic, no network or database.
//
// moodToDiscoverParams turns the user's picks into TMDB /discover query params;
// pickRecommendations chooses a handful from the resulting pool (watchlist first,
// already-watched excluded). Both are deliberately framework-free so they can be
// unit-tested and reused (e.g. by Watch Together to settle a debate between two
// users' pools).

import { providerTierIds } from "./providers";

export type MediaType = "movie" | "tv";
export type MediaChoice = MediaType | "both";
export type Vibe = "any" | "light" | "heavy" | "intense";
/** Minutes available for one sitting: a film's runtime or one episode's */
export type TimeAvailable = "any" | "30" | "120";

export interface MoodSelection {
  vibe: Vibe;
  /**
   * How long you've got. The same limit applies to a film's runtime and to one
   * episode, so the mix of movies and TV comes from runtimes, not from type: with
   * ~30 min, half-hour episodes qualify and feature films don't.
   */
  time: TimeAvailable;
  /** Released in roughly the last year */
  fresh: boolean;
  /** Only titles streaming on the user's saved services */
  onMyServices: boolean;
  media: MediaChoice;
}

export const DEFAULT_SELECTION: MoodSelection = {
  vibe: "any",
  time: "any",
  fresh: false,
  onMyServices: false,
  media: "both",
};

// What each mood means in TMDB genres, per media type (IDs differ: TV has no
// "Thriller" or "Horror", and merges Action & Adventure / Sci-Fi & Fantasy).
//  - any:     a title needs at least one of these (discover with_genres, "|")
//  - none:    a title with any of these is out (without_genres)
//  - against: allowed, but lowers the tone score (see traitScore), so e.g. a pure
//             drama ranks above an action blockbuster with a drama tag for "Heavy"
// Light was tightened after a quality check: Romance, Music or Animation alone let
// in Titanic, Whiplash and action anime. Tests in moodPicker.test.ts pin these lists.
type VibeGenres = { any: number[]; none: number[]; against: number[] };
const VIBE_GENRES: Record<MediaType, Record<Exclude<Vibe, "any">, VibeGenres>> = {
  movie: {
    // Comedy, Family | not Horror, War, Thriller, Crime | dramedies rank lower
    light: { any: [35, 10751], none: [27, 10752, 53, 80], against: [18] },
    // Drama | not Comedy, Family, Animation | less: Action, Adventure, Sci-Fi, Fantasy
    heavy: { any: [18], none: [35, 10751, 16], against: [28, 12, 878, 14] },
    // Thriller, Action, Horror, Crime, War, Mystery | not Family, Animation, Comedy
    intense: { any: [53, 28, 27, 80, 10752, 9648], none: [10751, 16, 35], against: [] },
  },
  tv: {
    // Comedy, Family | not Crime, War & Politics | dramedies rank lower
    light: { any: [35, 10751], none: [80, 10768], against: [18] },
    // Drama | not Comedy, Family, Animation, Kids | less: Action & Adv., Sci-Fi & Fantasy
    heavy: { any: [18], none: [35, 10751, 16, 10762], against: [10759, 10765] },
    // Crime, Action & Adv., Mystery, War & Politics, Sci-Fi & Fantasy | not Family, Animation, Kids, Comedy
    intense: { any: [80, 10759, 9648, 10768, 10765], none: [10751, 16, 10762, 35], against: [] },
  },
};

// Kids, News, Reality, Soap, Talk — daily shows otherwise crowd out scripted series
// (same exclusion as getNewOnStreamingTV in lib/tmdb.ts).
const TV_ALWAYS_EXCLUDED = [10762, 10763, 10764, 10766, 10767];

// Below this a "title" is usually a clip or extra, not something to sit down to
const MIN_RUNTIME_MINUTES = 10;
export const FRESH_WINDOW_DAYS = 365;

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBefore(today: Date, days: number): string {
  return isoDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));
}

export interface DiscoverContext {
  /** Injected so tests are deterministic */
  today: Date;
  /** User's saved (canonical) streaming service IDs */
  providerIds: number[];
  region?: string;
}

/**
 * Map a mood selection to TMDB discover query params for one media type.
 * Returns a plain string map; the caller adds api_key and page.
 */
export function moodToDiscoverParams(
  selection: MoodSelection,
  media: MediaType,
  ctx: DiscoverContext
): Record<string, string> {
  const params: Record<string, string> = {
    sort_by: "popularity.desc",
    "vote_average.gte": "6.5",
    // Recent titles haven't had time to collect votes, so the floor drops for them
    "vote_count.gte": selection.fresh ? "50" : media === "movie" ? "300" : "150",
  };

  const without = new Set<number>(media === "tv" ? TV_ALWAYS_EXCLUDED : []);

  if (selection.vibe !== "any") {
    const g = VIBE_GENRES[media][selection.vibe];
    params.with_genres = g.any.join("|"); // "|" = any of
    g.none.forEach((id) => without.add(id));
  }

  if (without.size > 0) params.without_genres = [...without].join(",");

  if (selection.time !== "any") {
    params["with_runtime.gte"] = String(MIN_RUNTIME_MINUTES);
    params["with_runtime.lte"] = selection.time;
  }

  if (selection.fresh) {
    const field = media === "movie" ? "primary_release_date" : "first_air_date";
    params[`${field}.gte`] = daysBefore(ctx.today, FRESH_WINDOW_DAYS);
    params[`${field}.lte`] = isoDate(ctx.today);
  }

  if (selection.onMyServices && ctx.providerIds.length > 0) {
    const ids = [...new Set(ctx.providerIds.flatMap(providerTierIds))];
    params.with_watch_providers = ids.join("|");
    params.watch_region = ctx.region ?? "US";
    params.with_watch_monetization_types = "flatrate";
  }

  return params;
}

export function mediaTypesFor(choice: MediaChoice): MediaType[] {
  return choice === "both" ? ["movie", "tv"] : [choice];
}

/** Parse ?vibe=&time=&fresh=&services=&media= from a URL, ignoring junk values. */
export function parseMoodSelection(params: URLSearchParams): MoodSelection {
  const vibe = params.get("vibe");
  const media = params.get("media");
  const time = params.get("time");
  const flag = (k: string) => params.get(k) === "1";
  return {
    vibe: vibe === "light" || vibe === "heavy" || vibe === "intense" ? vibe : "any",
    time: time === "30" || time === "120" ? time : "any",
    fresh: flag("fresh"),
    onMyServices: flag("services"),
    media: media === "movie" || media === "tv" ? media : "both",
  };
}

export function moodSelectionToQuery(s: MoodSelection): string {
  const q = new URLSearchParams({ vibe: s.vibe, media: s.media, time: s.time });
  if (s.fresh) q.set("fresh", "1");
  if (s.onMyServices) q.set("services", "1");
  return q.toString();
}

// ── Picking ──────────────────────────────────────────────────────────────────

export interface MoodCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  date: string;
  overview: string;
  popularity: number;
  voteAverage: number;
  /** Traits used for scoring; optional so partial data still works */
  voteCount?: number;
  genreIds?: number[];
  /** TMDB `original_language` ("en", "ko"…) when the source gives it */
  originalLanguage?: string;
}

export interface MoodPick extends MoodCandidate {
  onWatchlist: boolean;
}

export const candidateKey = (c: { id: number; mediaType: MediaType }) => `${c.mediaType}-${c.id}`;

export interface PickOptions {
  /** Keys (candidateKey) of titles on the user's want-to-watch list */
  watchlist: Set<string>;
  /** Keys of titles already watched / not interested — never shown */
  exclude: Set<string>;
  /** Keys currently on screen; a shuffle avoids repeating them when it can */
  avoid?: Set<string>;
  count?: number;
  /** The moods picked, so titles are scored on how strongly they fit them */
  selection?: MoodSelection;
  /** Injected so tests are deterministic; defaults to Math.random */
  random?: () => number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * How good a pick a title is, 0–1, judged only on its traits — never on whether
 * it's a movie or a show. Time available is already a hard filter on runtime /
 * episode length, so here it's:
 *  - tone: how strongly its genres match the mood (a pure sitcom is "lighter"
 *    than a dramedy; a pure drama "heavier" than an action film with a drama tag)
 *  - quality: rating, shrunk towards average when there are few votes, so a 9.0
 *    from 40 votes doesn't beat an 8.4 from 20,000
 */
export function traitScore(c: MoodCandidate, selection?: MoodSelection): number {
  const votes = c.voteCount ?? 0;
  const PRIOR_VOTES = 300;
  const PRIOR_RATING = 6.8;
  const rating = (votes * c.voteAverage + PRIOR_VOTES * PRIOR_RATING) / (votes + PRIOR_VOTES);
  const quality = clamp01((rating - 6) / 2.5);

  let tone = 0.5; // no vibe picked: tone doesn't matter
  if (selection && selection.vibe !== "any" && c.genreIds && c.genreIds.length > 0) {
    const g = VIBE_GENRES[c.mediaType][selection.vibe];
    const hits = c.genreIds.filter((id) => g.any.includes(id)).length;
    const misses = c.genreIds.filter((id) => g.against.includes(id) || g.none.includes(id)).length;
    tone = clamp01(0.5 + 0.25 * hits - 0.25 * misses);
  }

  return 0.5 * quality + 0.5 * tone;
}

/**
 * Choose `count` titles from a candidate pool: drop excluded and duplicate titles,
 * put watchlist matches first, prefer titles not currently shown, and favour
 * titles whose traits fit the mood best. Randomised so "Shuffle" gives a fresh set.
 */
export function pickRecommendations(pool: MoodCandidate[], opts: PickOptions): MoodPick[] {
  const { watchlist, exclude, avoid = new Set<string>(), count = 5, random = Math.random, selection } = opts;

  const seen = new Set<string>();
  const eligible: MoodCandidate[] = [];
  for (const c of pool) {
    const key = candidateKey(c);
    if (seen.has(key) || exclude.has(key) || !c.posterPath) continue;
    seen.add(key);
    eligible.push(c);
  }

  // Tiers, best first: fresh watchlist → fresh other → repeat watchlist → repeat other.
  // Within a tier, a weighted random draw: better-fitting titles (traitScore)
  // come up more often, but Shuffle still varies. Movies and TV compete on the
  // same traits, so the mix follows the mood — "~30 min + Light" means sitcom
  // episodes because of their runtime and genre — rather than a fixed quota. (Efraimidis–Spirakis: sort by
  // random^(1/weight); the small floor gives every match some chance.)
  const tier = (c: MoodCandidate) => {
    const key = candidateKey(c);
    return (avoid.has(key) ? 2 : 0) + (watchlist.has(key) ? 0 : 1);
  };
  const buckets: { c: MoodCandidate; key: number }[][] = [[], [], [], []];
  for (const c of eligible) {
    const weight = 0.05 + traitScore(c, selection);
    buckets[tier(c)].push({ c, key: Math.pow(random(), 1 / weight) });
  }
  const ranked = buckets.flatMap((b) => b.sort((a, z) => z.key - a.key).map((x) => x.c));

  return ranked
    .slice(0, count)
    .map((c) => ({ ...c, onWatchlist: watchlist.has(candidateKey(c)) }));
}

/**
 * After the user adds or updates a title, refresh the cards on screen: keep them
 * in place with up-to-date watchlist flags, but drop any just marked watched or
 * not interested (now in `exclude`) and refill those slots from the pool. A
 * replacement takes the removed card's slot, so the other cards don't shift.
 * If the pool runs dry, the slots it can't fill are dropped.
 */
export function refreshPicks(
  current: MoodPick[],
  pool: MoodCandidate[],
  opts: Omit<PickOptions, "avoid">
): MoodPick[] {
  const count = opts.count ?? 5;
  const removed = current.filter((p) => opts.exclude.has(candidateKey(p))).length;
  const flagged = (p: MoodPick) => ({ ...p, onWatchlist: opts.watchlist.has(candidateKey(p)) });
  if (removed === 0) return current.map(flagged); // nothing removed
  const onScreen = new Set(current.map(candidateKey));
  const refill = pickRecommendations(pool, {
    ...opts,
    // Never re-add a card that was just removed or is still showing
    exclude: new Set([...opts.exclude, ...onScreen]),
    count: Math.min(count - (current.length - removed), removed),
  });
  let next = 0;
  return current.flatMap((p) => {
    if (!opts.exclude.has(candidateKey(p))) return [flagged(p)];
    return next < refill.length ? [refill[next++]] : [];
  });
}

/**
 * Build one candidate pool from per-type discover results without a hidden
 * movie/TV quota: each type gets a share of `size` proportional to how many of
 * its titles matched the filters (TMDB's total_results). With "~30 min", ~790
 * shows but only ~80 short films match, so the pool is ~90% TV — because of
 * runtimes, not because of type. Each group's order (popularity) is kept; if a
 * type has too few candidates, the other tops up.
 */
export function blendPools(
  groups: { candidates: MoodCandidate[]; total: number }[],
  size: number
): MoodCandidate[] {
  const sum = groups.reduce((n, g) => n + g.total, 0);
  if (sum === 0) return [];
  const taken = groups.map((g) =>
    g.total > 0 ? Math.min(g.candidates.length, Math.max(1, Math.round((size * g.total) / sum))) : 0
  );
  // Top up from whichever groups still have candidates
  let short = size - taken.reduce((a, b) => a + b, 0);
  for (let i = 0; short > 0 && i < groups.length; i++) {
    const extra = Math.min(short, groups[i].candidates.length - taken[i]);
    taken[i] += extra;
    short -= extra;
  }
  return groups.flatMap((g, i) => g.candidates.slice(0, taken[i])).slice(0, size);
}

// ── Matching a known title against the same filters ──────────────────────────

export interface TitleFacts {
  genreIds: number[];
  /** Movie runtime or typical episode length, in minutes; null if TMDB doesn't know */
  runtime: number | null;
  /** Release / first-air date, YYYY-MM-DD */
  date: string | null;
  voteAverage: number;
  /** Subscription ("flatrate") providers in the watch region */
  providerIds: number[];
}

/**
 * Does a runtime (minutes) satisfy the time limit in discover params? With no
 * limit anything goes; with one, an unknown runtime fails, so "Under 2 hrs" never
 * shows a title we can't vouch for.
 */
export function fitsRuntime(params: Record<string, string>, runtime: number | null): boolean {
  const rtMin = params["with_runtime.gte"];
  const rtMax = params["with_runtime.lte"];
  if (!rtMin && !rtMax) return true;
  if (runtime == null) return false;
  if (rtMin && runtime < Number(rtMin)) return false;
  if (rtMax && runtime > Number(rtMax)) return false;
  return true;
}

/** Every runtime lookup failed, so TMDB is down or erroring: not "nothing matches". */
export class RuntimeLookupsFailedError extends Error {
  constructor(count: number) {
    super(`All ${count} runtime lookups failed`);
    this.name = "RuntimeLookupsFailedError";
  }
}

/**
 * Keep only candidates whose real runtime fits the time limit. TMDB's discover
 * `with_runtime` filter is leaky for movies (it has returned 3-hour films for
 * "≤ 120 min"), so the route re-checks each one with a details lookup. A lookup
 * that fails drops the title: better one fewer suggestion than a wrong one. But
 * if every lookup fails, it throws RuntimeLookupsFailedError, so the caller can
 * report an error instead of an empty (and misleading) "nothing matches".
 * Order is kept. `lookup` is injected so this stays free of network code.
 *
 * `maxChecks` bounds the lookups: only the first N candidates (the most popular,
 * since pools are popularity-ordered) are checked, and the rest are dropped.
 */
export async function filterByRealRuntime<C extends MoodCandidate>(
  candidates: C[],
  params: Record<string, string>,
  lookup: (c: C) => Promise<number | null>,
  opts: { maxChecks?: number } = {}
): Promise<C[]> {
  if (fitsRuntime(params, null)) return candidates; // no time limit
  const toCheck = candidates.slice(0, opts.maxChecks ?? candidates.length);
  const checks = await Promise.allSettled(toCheck.map(lookup));
  if (checks.length > 0 && checks.every((r) => r.status === "rejected")) {
    throw new RuntimeLookupsFailedError(checks.length);
  }
  return toCheck.filter((_, i) => {
    const r = checks[i];
    return r.status === "fulfilled" && fitsRuntime(params, r.value);
  });
}

/**
 * Does a title satisfy discover params built by moodToDiscoverParams? Used for the
 * user's watchlist, which TMDB discover can't filter by ID. Interpreting the params
 * (rather than re-deriving from the selection) keeps one source of truth for what
 * each mood means. vote_count is ignored — the user already chose these titles.
 */
export function matchesDiscoverParams(params: Record<string, string>, t: TitleFacts): boolean {
  const ids = (v: string | undefined, sep: string) => (v ? v.split(sep).map(Number) : []);

  const anyGenre = ids(params.with_genres, "|");
  if (anyGenre.length > 0 && !anyGenre.some((g) => t.genreIds.includes(g))) return false;
  if (ids(params.without_genres, ",").some((g) => t.genreIds.includes(g))) return false;

  const minVote = Number(params["vote_average.gte"] ?? 0);
  if (t.voteAverage > 0 && t.voteAverage < minVote) return false;

  if (!fitsRuntime(params, t.runtime)) return false;

  const dateFrom = params["primary_release_date.gte"] ?? params["first_air_date.gte"];
  const dateTo = params["primary_release_date.lte"] ?? params["first_air_date.lte"];
  if (dateFrom || dateTo) {
    if (!t.date) return false;
    if (dateFrom && t.date < dateFrom) return false; // ISO dates compare as strings
    if (dateTo && t.date > dateTo) return false;
  }

  const providers = ids(params.with_watch_providers, "|");
  if (providers.length > 0 && !providers.some((p) => t.providerIds.includes(p))) return false;

  return true;
}
