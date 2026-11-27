/**
 * Client-side helpers for "Tonight for you both" (spec §5.3, §7): draw the 5
 * cards from the ranked pair pool, and build the /picks query string.
 * Pure, so the draw is unit-tested with an injected random.
 */
import type { MoodSelection } from "./moodPicker";

export const TONIGHT_COUNT = 5;

/** The minimum a candidate needs from the pool to be drawn. */
export interface Drawable {
  id: number;
  mediaType: "movie" | "tv";
  /** 0–1, 1 = top of the ranked pool */
  pairScore: number;
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
}

/**
 * Weighted shuffle: draw `count` distinct titles without replacement, each
 * with probability proportional to drawWeight. Titles in `avoid` are only used
 * if there aren't enough others. The result is ordered best first, so the
 * strongest pick leads the row.
 */
export function drawPairPicks<C extends Drawable>(pool: readonly C[], opts: DrawOptions = {}): C[] {
  const { count = TONIGHT_COUNT, avoid = new Set<string>(), random = Math.random } = opts;

  const seen = new Set<string>();
  const fresh: C[] = [];
  const repeats: C[] = [];
  for (const c of pool) {
    const key = keyOf(c);
    if (seen.has(key)) continue;
    seen.add(key);
    (avoid.has(key) ? repeats : fresh).push(c);
  }

  const drawn = drawFrom(fresh, count, random);
  if (drawn.length < count) drawn.push(...drawFrom(repeats, count - drawn.length, random));
  return drawn.sort((a, b) => b.pairScore - a.pairScore);
}

function drawFrom<C extends Drawable>(items: readonly C[], count: number, random: () => number): C[] {
  const left = [...items];
  const out: C[] = [];
  while (out.length < count && left.length > 0) {
    const weights = left.map((c) => drawWeight(c.pairScore));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = random() * total;
    let i = 0;
    while (i < left.length - 1 && r >= weights[i]) {
      r -= weights[i];
      i++;
    }
    out.push(left[i]);
    left.splice(i, 1);
  }
  return out;
}

/**
 * Query for `GET /api/watch-together/[userId]/picks`. No `media`: the pair
 * pool is always movies and TV. Only non-default values are sent.
 */
export function pairPicksQuery(selection: MoodSelection, sharedOnly: boolean): string {
  const q = new URLSearchParams();
  if (selection.vibe !== "any") q.set("vibe", selection.vibe);
  if (selection.time !== "any") q.set("time", selection.time);
  if (selection.fresh) q.set("fresh", "1");
  if (selection.onMyServices) q.set("services", "1");
  // "Only services we both have" narrows "On our services"; alone it means nothing
  if (selection.onMyServices && sharedOnly) q.set("sharedOnly", "1");
  return q.toString();
}

/** Which empty state to show when a load returns no titles (§5.3). */
export type EmptyKind = "services" | "mood" | "none";

export function emptyKind(selection: MoodSelection): EmptyKind {
  if (selection.onMyServices) return "services";
  if (selection.vibe !== "any" || selection.time !== "any" || selection.fresh) return "mood";
  return "none";
}
