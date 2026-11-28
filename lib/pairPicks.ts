/**
 * Client-side helpers for "Tonight for you both" (spec §5.3, §7): draw the 12
 * cards from the ranked pair pool, and build the /picks query string.
 * Pure, so the draw is unit-tested with an injected random.
 */
import type { MoodSelection } from "./moodPicker";
import { FULL_CONFIDENCE_SIGNALS } from "./pairTaste";

export const TONIGHT_COUNT = 12;

/** Most picks in one draw that may share a "Because you loved X" seed line. */
export const MAX_PER_SEED = 3;

/**
 * How many picks to show so the grid ends on a full row: at least
 * TONIGHT_COUNT and at least two rows. 3 columns → 12, 7 → 14, 11 → 22.
 * An unmeasured or nonsensical column count falls back to TONIGHT_COUNT.
 */
export function pickCountForColumns(columns: number): number {
  if (!Number.isFinite(columns) || columns < 1) return TONIGHT_COUNT;
  const cols = Math.floor(columns);
  return cols * Math.max(2, Math.ceil(TONIGHT_COUNT / cols));
}

/**
 * Columns in a laid-out CSS grid, from its computed `grid-template-columns`
 * (a space-separated list of resolved track sizes, e.g. "150px 150px 150px").
 * Returns 0 when it can't be read ("none", "").
 */
export function columnsFromTemplate(template: string | null | undefined): number {
  const t = (template ?? "").trim();
  if (!t || t === "none") return 0;
  // Resolved sizes never contain spaces, except inside a function like minmax(...), which a computed value doesn't keep
  return t.split(/\s+/).length;
}

/** The minimum a candidate needs from the pool to be drawn. */
export interface Drawable {
  id: number;
  mediaType: "movie" | "tv";
  /** 0–1, 1 = top of the ranked pool */
  pairScore: number;
  /** Picks with the same seedKey are capped per draw (MAX_PER_SEED) */
  seedKey?: string;
}

const keyOf = (c: Drawable) => `${c.mediaType}-${c.id}`;

/**
 * Weight for a candidate when drawing. Squaring the 0–1 rank makes the top of
 * the pool several times likelier than the bottom, so a draw is mostly the
 * best fits with a little variety; the small floor keeps every title possible.
 * Only the rank and score count: never whether it's a movie or a show (§4).
 */
export function drawWeight(pairScore: number): number {
  const s = Number.isFinite(pairScore) ? Math.min(1, Math.max(0, pairScore)) : 0;
  return 0.05 + s * s;
}

export interface DrawOptions {
  count?: number;
  /** Keys (`movie-123`) on screen now; Shuffle avoids repeating them when it can */
  avoid?: ReadonlySet<string>;
  /** Injected for tests; defaults to Math.random */
  random?: () => number;
  /** Most picks that may share a seedKey; defaults to MAX_PER_SEED */
  maxPerSeed?: number;
  /** Seed counts of picks already on screen (when topping up a draw) */
  seedCounts?: ReadonlyMap<string, number>;
}

/**
 * Weighted shuffle: draw `count` distinct titles without replacement, each
 * with probability proportional to drawWeight. Titles in `avoid` are only used
 * if there aren't enough others. The result is ordered best first, so the
 * strongest pick leads the row.
 */
export function drawPairPicks<C extends Drawable>(pool: readonly C[], opts: DrawOptions = {}): C[] {
  const {
    count = TONIGHT_COUNT,
    avoid = new Set<string>(),
    random = Math.random,
    maxPerSeed = MAX_PER_SEED,
    seedCounts,
  } = opts;

  const seen = new Set<string>();
  const fresh: C[] = [];
  const repeats: C[] = [];
  for (const c of pool) {
    const key = keyOf(c);
    if (seen.has(key)) continue;
    seen.add(key);
    (avoid.has(key) ? repeats : fresh).push(c);
  }

  // Each pass respects the per-seed cap; fresh titles come before repeats. Only if the capped
  // passes can't fill the grid (a small pool dominated by one seed) is the cap relaxed, because
  // a complete row matters more than the mix.
  const counts = new Map(seedCounts);
  const drawn: C[] = [];
  const take = (items: readonly C[], cap: number) => drawn.push(...drawFrom(items, count - drawn.length, random, counts, cap));
  take(fresh, maxPerSeed);
  if (drawn.length < count) take(repeats, maxPerSeed);
  if (drawn.length < count) {
    const used = new Set(drawn.map(keyOf));
    take([...fresh, ...repeats].filter((c) => !used.has(keyOf(c))), Infinity);
  }
  return drawn.sort((a, b) => b.pairScore - a.pairScore);
}

function drawFrom<C extends Drawable>(
  items: readonly C[],
  count: number,
  random: () => number,
  seedCounts: Map<string, number>,
  maxPerSeed: number
): C[] {
  const left = [...items];
  const out: C[] = [];
  while (out.length < count && left.length > 0) {
    // A seed at its cap drops out of this draw; titles without a seed are never capped
    const eligible = left.filter((c) => !c.seedKey || (seedCounts.get(c.seedKey) ?? 0) < maxPerSeed);
    if (eligible.length === 0) break;
    const weights = eligible.map((c) => drawWeight(c.pairScore));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = random() * total;
    let i = 0;
    while (i < eligible.length - 1 && r >= weights[i]) {
      r -= weights[i];
      i++;
    }
    const chosen = eligible[i];
    out.push(chosen);
    if (chosen.seedKey) seedCounts.set(chosen.seedKey, (seedCounts.get(chosen.seedKey) ?? 0) + 1);
    left.splice(left.indexOf(chosen), 1);
  }
  return out;
}

/**
 * Shuffle: draw the next `count` titles, avoiding everything shown since the
 * pool loaded (`seen`) while enough unseen titles remain. When fewer than
 * `count` are left, the draw tops up with repeats and the cycle starts again
 * from what's on screen. Returns the new picks and the new `seen` set.
 */
export function nextShuffle<C extends Drawable>(
  pool: readonly C[],
  seen: ReadonlySet<string>,
  opts: { count?: number; random?: () => number } = {}
): { picks: C[]; seen: Set<string> } {
  const count = opts.count ?? TONIGHT_COUNT;
  const unseen = new Set(pool.map(keyOf).filter((k) => !seen.has(k))).size;
  const picks = drawPairPicks(pool, { count, avoid: seen, random: opts.random });
  const shown = picks.map(keyOf);
  return { picks, seen: new Set(unseen >= count ? [...seen, ...shown] : shown) };
}

/**
 * Keep the picks still on screen and top them up to `count` from the pool,
 * so hiding a card (watched, not interested) refills the row instead of
 * leaving a gap. Replacements avoid cards already shown and hidden titles.
 * Returns `current` itself when nothing needs to change, so a state setter
 * can bail out.
 */
export function refillPicks<C extends Drawable>(
  current: readonly C[],
  pool: readonly C[],
  hidden: ReadonlySet<string>,
  opts: { count?: number; random?: () => number } = {}
): C[] {
  const { count = TONIGHT_COUNT, random } = opts;
  const kept = current.filter((c) => !hidden.has(keyOf(c)));
  // A wider grid keeps more; a narrower one trims from the bottom (the list is best first)
  if (kept.length > count) return kept.slice(0, count);
  if (kept.length >= count || kept.length === pool.filter((c) => !hidden.has(keyOf(c))).length) {
    return kept.length === current.length ? (current as C[]) : kept;
  }
  const onScreen = new Set(kept.map(keyOf));
  const candidates = pool.filter((c) => !hidden.has(keyOf(c)) && !onScreen.has(keyOf(c)));
  const seedCounts = new Map<string, number>();
  for (const c of kept) if (c.seedKey) seedCounts.set(c.seedKey, (seedCounts.get(c.seedKey) ?? 0) + 1);
  const extra = drawPairPicks(candidates, { count: count - kept.length, random, seedCounts });
  return [...kept, ...extra].sort((a, b) => b.pairScore - a.pairScore);
}

/**
 * Query for `GET /api/watch-together/[userId]/picks`. Only non-default
 * values are sent; `media` is a filter (both = movies and TV mixed).
 */
export function pairPicksQuery(selection: MoodSelection, sharedOnly: boolean): string {
  const q = new URLSearchParams();
  if (selection.vibe !== "any") q.set("vibe", selection.vibe);
  if (selection.media !== "both") q.set("media", selection.media);
  if (selection.time !== "any") q.set("time", selection.time);
  if (selection.fresh) q.set("fresh", "1");
  if (selection.onMyServices) q.set("services", "1");
  // "Only services we both have" narrows "On our services"; alone it means nothing
  if (selection.onMyServices && sharedOnly) q.set("sharedOnly", "1");
  return q.toString();
}

/** Taste signals a person needs for the model to be fully confident in them. */
export const RATINGS_TARGET = FULL_CONFIDENCE_SIGNALS;

/** The rate-more note: shown until a person has RATINGS_TARGET signals. */
export function ratingsNudge(signals: number | undefined): { count: number; target: number } | null {
  if (typeof signals !== "number" || !Number.isFinite(signals)) return null;
  const count = Math.max(0, Math.floor(signals));
  return count < RATINGS_TARGET ? { count, target: RATINGS_TARGET } : null;
}

/** Which empty state to show when a load returns no titles (§5.3). */
export type EmptyKind = "services" | "mood" | "none";

export function emptyKind(selection: MoodSelection): EmptyKind {
  if (selection.onMyServices) return "services";
  if (selection.vibe !== "any" || selection.time !== "any" || selection.fresh) return "mood";
  return "none";
}
