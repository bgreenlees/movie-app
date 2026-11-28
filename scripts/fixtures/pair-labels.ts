// The owner's labelled titles for the "true-story" persona pair (#193, #196).
// good = should reach the grid; bad = should not. They come from real use of the
// app, so they are the regression check that matters most: the eval prints how
// likely each is to be drawn, and the summary adds up the expected good and bad.

import { drawPairPicks, TONIGHT_COUNT, type Drawable } from "../../lib/pairPicks";

export interface Label {
  /** `<media>-<tmdb id>`, as lib/moodPicker candidateKey */
  key: string;
  title: string;
  label: "good" | "bad";
}

/** Persona pair these labels belong to (scripts/fixtures/pair-personas.ts) */
export const LABELLED_PAIR = "true-story";

export const LABELS: readonly Label[] = [
  { key: "movie-294016", title: "Trumbo", label: "good" },
  { key: "movie-451915", title: "Beautiful Boy", label: "good" },
  { key: "movie-249164", title: "If I Stay", label: "bad" },
  { key: "movie-677179", title: "Creed III", label: "bad" },
  { key: "tv-247718", title: "MobLand", label: "bad" },
  { key: "movie-1315772", title: "Minions & Monsters", label: "bad" },
  { key: "movie-1419406", title: "The Shadow's Edge", label: "bad" },
];

export interface LabelRow extends Label {
  /** 1-based position in the ranked pool, or null when it isn't in the pool at all */
  rank: number | null;
  /** Share of simulated draws (default 12 cards) that include it, 0–1 */
  chance: number;
}

export interface LabelReport {
  rows: LabelRow[];
  /** Expected number of good titles in one draw (higher is better) */
  expectedGood: number;
  /** Expected number of bad titles in one draw (lower is better) */
  expectedBad: number;
}

/**
 * Where each labelled title sits in a ranked pool and how often the real draw
 * (drawPairPicks) would show it. `random` is injected so the run is repeatable.
 */
export function labelReport<C extends Drawable>(
  pool: readonly C[],
  labels: readonly Label[],
  random: () => number,
  draws = 2000,
  count = TONIGHT_COUNT
): LabelReport {
  const hits = new Map<string, number>();
  for (let i = 0; i < draws; i++) {
    for (const c of drawPairPicks(pool, { count, random })) {
      const key = `${c.mediaType}-${c.id}`;
      hits.set(key, (hits.get(key) ?? 0) + 1);
    }
  }
  const rows = labels.map((l): LabelRow => {
    const at = pool.findIndex((c) => `${c.mediaType}-${c.id}` === l.key);
    return { ...l, rank: at < 0 ? null : at + 1, chance: (hits.get(l.key) ?? 0) / draws };
  });
  const sum = (which: Label["label"]) => rows.filter((r) => r.label === which).reduce((s, r) => s + r.chance, 0);
  return { rows, expectedGood: sum("good"), expectedBad: sum("bad") };
}
