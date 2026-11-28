import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "./moodPicker";
import {
  MAX_PER_SEED,
  RATINGS_TARGET,
  columnsFromTemplate,
  pickCountForColumns,
  TONIGHT_COUNT,
  drawPairPicks,
  drawWeight,
  drawWindow,
  emptyKind,
  nextShuffle,
  pairPicksQuery,
  ratingsNudge,
  refillPicks,
} from "./pairPicks";

const c = (id: number, pairScore: number, mediaType: "movie" | "tv" = "movie") => ({ id, mediaType, pairScore });

// Deterministic generator (mulberry32) so draws are repeatable
function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("drawPairPicks", () => {
  const pool = Array.from({ length: 30 }, (_, i) => c(i, (30 - i) / 30, i % 2 ? "tv" : "movie"));

  it("draws 12 distinct titles, best first", () => {
    expect(TONIGHT_COUNT).toBe(12);
    const picks = drawPairPicks(pool, { random: seeded(1) });
    expect(picks).toHaveLength(12);
    expect(new Set(picks.map((p) => `${p.mediaType}-${p.id}`)).size).toBe(12);
    const scores = picks.map((p) => p.pairScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("returns what there is when the pool is small", () => {
    expect(drawPairPicks([c(1, 1), c(2, 0.5)])).toHaveLength(2);
    expect(drawPairPicks([])).toEqual([]);
  });

  it("drops duplicate titles but keeps a movie and show with the same id", () => {
    const picks = drawPairPicks([c(1, 1), c(1, 1), c(1, 0.9, "tv")], { random: seeded(2) });
    expect(picks.map((p) => `${p.mediaType}-${p.id}`).sort()).toEqual(["movie-1", "tv-1"]);
  });

  it("favours the top of the pool without always picking it", () => {
    const random = seeded(3);
    const hits = new Map<number, number>();
    for (let i = 0; i < 2000; i++) {
      for (const p of drawPairPicks(pool, { random })) hits.set(p.id, (hits.get(p.id) ?? 0) + 1);
    }
    const top = hits.get(0) ?? 0;
    const bottom = hits.get(29) ?? 0;
    expect(top).toBeGreaterThan(bottom * 3);
    expect(bottom).toBeGreaterThan(0); // the floor keeps every title possible
    expect(top).toBeLessThan(2000); // not a fixed top 12
  });

  it("Shuffle avoids the cards on screen when it can", () => {
    const first = drawPairPicks(pool, { random: seeded(4) });
    const avoid = new Set(first.map((p) => `${p.mediaType}-${p.id}`));
    const next = drawPairPicks(pool, { random: seeded(5), avoid });
    expect(next.some((p) => avoid.has(`${p.mediaType}-${p.id}`))).toBe(false);
  });

  it("tops up from the avoided cards when there aren't enough others", () => {
    const small = Array.from({ length: 14 }, (_, i) => c(i + 1, 1 - i / 14));
    const avoid = new Set(small.slice(0, 12).map((p) => `movie-${p.id}`));
    const picks = drawPairPicks(small, { random: seeded(6), avoid });
    expect(picks).toHaveLength(12);
    expect(picks.map((p) => p.id)).toEqual(expect.arrayContaining([13, 14]));
  });

  it("has no type quota: an all-TV pool gives all TV", () => {
    const tv = Array.from({ length: 10 }, (_, i) => c(i, 1 - i / 10, "tv"));
    expect(drawPairPicks(tv, { random: seeded(7) }).every((p) => p.mediaType === "tv")).toBe(true);
  });
});

describe("draw window (top 36)", () => {
  const big = Array.from({ length: 100 }, (_, i) => c(i + 1, 1 - i / 100));

  it("never draws from below the top 36 of the pool", () => {
    for (let s = 1; s <= 200; s++) {
      for (const p of drawPairPicks(big, { random: seeded(s) })) expect(p.id).toBeLessThanOrEqual(36);
    }
  });

  it("windows by score, not by the order the pool arrives in", () => {
    const shuffled = [...big].reverse();
    expect(drawWindow(shuffled).map((p) => p.id)).toEqual(Array.from({ length: 36 }, (_, i) => i + 1));
  });

  it("grows to three screens on a wider grid, and keeps a small pool whole", () => {
    expect(drawWindow(big, 14)).toHaveLength(42);
    expect(drawWindow(big.slice(0, 20))).toHaveLength(20);
  });
});

describe("drawWeight", () => {
  it("rises with the score and never hits zero", () => {
    expect(drawWeight(1)).toBeGreaterThan(drawWeight(0.5));
    expect(drawWeight(0)).toBeGreaterThan(0);
    expect(drawWeight(Number.NaN)).toBe(drawWeight(0));
    expect(drawWeight(5)).toBe(drawWeight(1));
  });
});

describe("pairPicksQuery", () => {
  it("sends nothing for the defaults (media both is the default)", () => {
    expect(pairPicksQuery(DEFAULT_SELECTION, false)).toBe("");
  });

  it("sends media only when it filters", () => {
    expect(pairPicksQuery({ ...DEFAULT_SELECTION, media: "movie" }, false)).toBe("media=movie");
    expect(pairPicksQuery({ ...DEFAULT_SELECTION, media: "tv" }, false)).toBe("media=tv");
  });

  it("sends the chosen moods", () => {
    const q = new URLSearchParams(
      pairPicksQuery({ ...DEFAULT_SELECTION, vibe: "light", time: "30", fresh: true, onMyServices: true }, true)
    );
    expect(Object.fromEntries(q)).toEqual({ vibe: "light", time: "30", fresh: "1", services: "1", sharedOnly: "1" });
  });

  it("only sends sharedOnly with services on", () => {
    expect(pairPicksQuery(DEFAULT_SELECTION, true)).toBe("");
  });
});

describe("emptyKind", () => {
  it("blames services first, then the mood", () => {
    expect(emptyKind({ ...DEFAULT_SELECTION, onMyServices: true, vibe: "light" })).toBe("services");
    expect(emptyKind({ ...DEFAULT_SELECTION, vibe: "light" })).toBe("mood");
    expect(emptyKind({ ...DEFAULT_SELECTION, time: "30" })).toBe("mood");
    expect(emptyKind(DEFAULT_SELECTION)).toBe("none");
  });
});

describe("refillPicks", () => {
  const pool = Array.from({ length: 30 }, (_, i) => c(i + 1, 1 - i / 30));
  const shownNow = pool.slice(0, TONIGHT_COUNT);

  it("returns the same array when nothing is hidden", () => {
    expect(refillPicks(shownNow, pool, new Set())).toBe(shownNow);
  });

  it("tops up to 12 when picks are hidden, never repeating or using hidden titles", () => {
    const hidden = new Set(shownNow.map((p) => `${p.mediaType}-${p.id}`));
    const out = refillPicks(shownNow, pool, hidden, { random: seeded(1) });
    expect(out).toHaveLength(12);
    const ids = out.map((p) => p.id);
    expect(new Set(ids).size).toBe(12);
    expect(ids.every((id) => id > 12)).toBe(true);
  });

  it("keeps the visible picks and replaces only the hidden one", () => {
    const hidden = new Set(["movie-3"]);
    const out = refillPicks(shownNow, pool, hidden, { random: seeded(2) });
    expect(out).toHaveLength(12);
    expect(out.map((p) => p.id)).toEqual(expect.arrayContaining([1, 2, 4, 5, 12]));
    expect(out.some((p) => p.id === 3)).toBe(false);
  });

  it("gives what's left when the pool runs short, and none when it is empty", () => {
    const small = pool.slice(0, 14);
    const hidden = new Set(shownNow.slice(0, 10).map((p) => `${p.mediaType}-${p.id}`));
    expect(refillPicks(shownNow, small, hidden).map((p) => p.id).sort((a, b) => a - b)).toEqual([11, 12, 13, 14]);
    const all = new Set(small.map((p) => `${p.mediaType}-${p.id}`));
    expect(refillPicks(shownNow, small, all)).toEqual([]);
  });
});

describe("nextShuffle", () => {
  const pool = Array.from({ length: 60 }, (_, i) => c(i + 1, 1 - i / 60, i % 2 ? "tv" : "movie"));
  const key = (p: { id: number; mediaType: string }) => `${p.mediaType}-${p.id}`;

  it("gives a new 12 each time, with no repeats, through the top 36", () => {
    const random = seeded(11);
    let seen = new Set<string>();
    const all: string[] = [];
    for (let i = 0; i < 3; i++) {
      const next = nextShuffle(pool, seen, { random });
      expect(next.picks).toHaveLength(12);
      all.push(...next.picks.map(key));
      seen = next.seen;
    }
    // three screens used the whole window, none twice, and nothing from the tail
    expect(new Set(all).size).toBe(36);
    expect(all.every((k) => Number(k.split("-")[1]) <= 36)).toBe(true);
  });

  it("starts a new cycle when fewer than 12 unseen titles are left", () => {
    const small = pool.slice(0, 20);
    const first = nextShuffle(small, new Set(), { random: seeded(1) });
    const second = nextShuffle(small, first.seen, { random: seeded(2) });
    expect(second.picks).toHaveLength(12); // 8 unseen + 4 repeats
    expect(second.picks.filter((p) => !first.seen.has(key(p)))).toHaveLength(8);
    expect(second.seen).toEqual(new Set(second.picks.map(key))); // cycle restarted from what's on screen
  });

  it("copes with a pool smaller than 12", () => {
    const tiny = pool.slice(0, 3);
    const next = nextShuffle(tiny, new Set(), { random: seeded(1) });
    expect(next.picks).toHaveLength(3);
  });
});

describe("ratingsNudge", () => {
  it("shows the count until the target of 10 and then disappears", () => {
    expect(RATINGS_TARGET).toBe(10);
    expect(ratingsNudge(0)).toEqual({ count: 0, target: 10 });
    expect(ratingsNudge(4)).toEqual({ count: 4, target: 10 });
    expect(ratingsNudge(9)).toEqual({ count: 9, target: 10 });
    expect(ratingsNudge(10)).toBeNull();
    expect(ratingsNudge(25)).toBeNull();
  });

  it("shows nothing when the API gave no count", () => {
    expect(ratingsNudge(undefined)).toBeNull();
    expect(ratingsNudge(Number.NaN)).toBeNull();
  });
});

describe("pickCountForColumns", () => {
  it("fills at least two complete rows of at least 12", () => {
    expect(pickCountForColumns(3)).toBe(12); // phone
    expect(pickCountForColumns(2)).toBe(12);
    expect(pickCountForColumns(5)).toBe(15);
    expect(pickCountForColumns(7)).toBe(14);
    expect(pickCountForColumns(11)).toBe(22);
    expect(pickCountForColumns(12)).toBe(24);
    expect(pickCountForColumns(20)).toBe(40);
  });
  it("is always a multiple of the columns, and at least two rows", () => {
    for (let cols = 1; cols <= 30; cols++) {
      const n = pickCountForColumns(cols);
      expect(n % cols).toBe(0);
      expect(n / cols).toBeGreaterThanOrEqual(2);
      expect(n).toBeGreaterThanOrEqual(TONIGHT_COUNT);
    }
  });
  it("falls back to 12 for an unmeasured count", () => {
    expect(pickCountForColumns(0)).toBe(12);
    expect(pickCountForColumns(Number.NaN)).toBe(12);
  });
});

describe("columnsFromTemplate", () => {
  it("counts the resolved tracks", () => {
    expect(columnsFromTemplate("150px 150px 150px")).toBe(3);
    expect(columnsFromTemplate("  141.5px 141.5px ")).toBe(2);
  });
  it("is 0 when there is nothing to read", () => {
    expect(columnsFromTemplate("none")).toBe(0);
    expect(columnsFromTemplate("")).toBe(0);
    expect(columnsFromTemplate(null)).toBe(0);
  });
});

describe("per-seed cap", () => {
  const seededPool = (seeds: Record<string, number>, plain = 0) => {
    const out: { id: number; mediaType: "movie"; pairScore: number; seedKey?: string }[] = [];
    let id = 1;
    for (const [seedKey, n] of Object.entries(seeds)) {
      for (let i = 0; i < n; i++) out.push({ id: id++, mediaType: "movie", pairScore: 1 - id / 1000, seedKey });
    }
    for (let i = 0; i < plain; i++) out.push({ id: id++, mediaType: "movie", pairScore: 0.1 });
    return out;
  };
  const perSeed = (picks: { seedKey?: string }[]) => {
    const m = new Map<string, number>();
    for (const p of picks) if (p.seedKey) m.set(p.seedKey, (m.get(p.seedKey) ?? 0) + 1);
    return m;
  };

  it("lets one seed contribute at most 3 picks while others can fill the draw", () => {
    // the big seed ranks last, so the top 42 holds all of the small seeds and the cap never has to relax
    const pool = seededPool({ b: 4, c: 4, d: 4, e: 4, f: 4, a: 30 });
    for (let s = 1; s <= 20; s++) {
      const picks = drawPairPicks(pool, { count: 14, random: seeded(s) });
      expect(picks).toHaveLength(14);
      for (const n of perSeed(picks).values()) expect(n).toBeLessThanOrEqual(MAX_PER_SEED);
    }
  });

  it("does not cap titles without a seed", () => {
    const picks = drawPairPicks(seededPool({ a: 10 }, 20), { count: 12, random: seeded(1) });
    expect(picks.filter((p) => !p.seedKey).length).toBeGreaterThanOrEqual(9);
  });

  it("relaxes the cap only when the pool can't otherwise fill the grid", () => {
    const picks = drawPairPicks(seededPool({ a: 10 }), { count: 6, random: seeded(1) });
    expect(picks).toHaveLength(6);
  });

  it("counts picks already on screen when topping up", () => {
    const pool = seededPool({ a: 10, b: 10 });
    const current = pool.filter((p) => p.seedKey === "a").slice(0, 3);
    const refilled = refillPicks(current, pool, new Set(), { count: 6, random: seeded(2) });
    expect(refilled).toHaveLength(6);
    expect(perSeed(refilled).get("a")).toBe(3);
  });
});

describe("refillPicks with a smaller count", () => {
  it("trims to the new count, keeping the best", () => {
    const pool = Array.from({ length: 20 }, (_, i) => c(i + 1, 1 - i / 20));
    const current = pool.slice(0, 14);
    const trimmed = refillPicks(current, pool, new Set(), { count: 12 });
    expect(trimmed).toEqual(current.slice(0, 12));
  });
});
