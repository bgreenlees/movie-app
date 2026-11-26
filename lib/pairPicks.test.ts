import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "./moodPicker";
import { drawPairPicks, drawWeight, emptyKind, pairPicksQuery } from "./pairPicks";

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
  const pool = Array.from({ length: 20 }, (_, i) => c(i, (20 - i) / 20, i % 2 ? "tv" : "movie"));

  it("draws 5 distinct titles, best first", () => {
    const picks = drawPairPicks(pool, { random: seeded(1) });
    expect(picks).toHaveLength(5);
    expect(new Set(picks.map((p) => `${p.mediaType}-${p.id}`)).size).toBe(5);
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
    const bottom = hits.get(19) ?? 0;
    expect(top).toBeGreaterThan(bottom * 3);
    expect(bottom).toBeGreaterThan(0); // the floor keeps every title possible
    expect(top).toBeLessThan(2000); // not a fixed top 5
  });

  it("Shuffle avoids the cards on screen when it can", () => {
    const first = drawPairPicks(pool, { random: seeded(4) });
    const avoid = new Set(first.map((p) => `${p.mediaType}-${p.id}`));
    const next = drawPairPicks(pool, { random: seeded(5), avoid });
    expect(next.some((p) => avoid.has(`${p.mediaType}-${p.id}`))).toBe(false);
  });

  it("tops up from the avoided cards when there aren't enough others", () => {
    const small = [c(1, 1), c(2, 0.8), c(3, 0.6), c(4, 0.4), c(5, 0.2), c(6, 0.1)];
    const avoid = new Set(["movie-1", "movie-2", "movie-3", "movie-4", "movie-5"]);
    const picks = drawPairPicks(small, { random: seeded(6), avoid });
    expect(picks).toHaveLength(5);
    expect(picks.map((p) => p.id)).toContain(6);
  });

  it("has no type quota: an all-TV pool gives all TV", () => {
    const tv = Array.from({ length: 10 }, (_, i) => c(i, 1 - i / 10, "tv"));
    expect(drawPairPicks(tv, { random: seeded(7) }).every((p) => p.mediaType === "tv")).toBe(true);
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
  it("sends nothing for the defaults and never sends media", () => {
    expect(pairPicksQuery(DEFAULT_SELECTION, false)).toBe("");
    expect(pairPicksQuery({ ...DEFAULT_SELECTION, media: "movie" }, false)).toBe("");
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
