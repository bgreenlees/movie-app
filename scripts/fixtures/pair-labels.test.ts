import { describe, expect, it } from "vitest";
import { LABELLED_PAIR, LABELS, labelReport } from "./pair-labels";
import { PAIRS } from "./pair-personas";

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe("labelled set", () => {
  it("names a real persona pair, with the owner's two good and five bad titles", () => {
    expect(PAIRS.some((p) => p.id === LABELLED_PAIR)).toBe(true);
    expect(LABELS.filter((l) => l.label === "good").map((l) => l.title)).toEqual(["Trumbo", "Beautiful Boy"]);
    expect(LABELS.filter((l) => l.label === "bad")).toHaveLength(5);
    expect(new Set(LABELS.map((l) => l.key)).size).toBe(LABELS.length);
  });

  it("keeps the labelled titles out of the personas' own lists", () => {
    const pair = PAIRS.find((p) => p.id === LABELLED_PAIR)!;
    const owned = new Set([...pair.a.titles, ...pair.b.titles].map((x) => `${x.media}-${x.id}`));
    for (const l of LABELS) expect(owned.has(l.key), l.title).toBe(false);
  });
});

describe("labelReport", () => {
  // 50 titles, best first: ids 1..50. Trumbo (id 5) is near the top, MobLand (tv 9) near the bottom, If I Stay absent.
  const pool = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    mediaType: (i + 1 === 9 ? "tv" : "movie") as "movie" | "tv",
    pairScore: 1 - i / 50,
  }));
  const labels = [
    { key: "movie-5", title: "Trumbo", label: "good" as const },
    { key: "tv-9", title: "MobLand", label: "bad" as const },
    { key: "movie-49", title: "Tail", label: "bad" as const },
    { key: "movie-999", title: "Absent", label: "bad" as const },
  ];

  it("reports rank and chance, with null rank for a title that isn't in the pool", () => {
    const r = labelReport(pool, labels, seeded(1), 500);
    expect(r.rows.map((x) => x.rank)).toEqual([5, 9, 49, null]);
    expect(r.rows[3].chance).toBe(0);
  });

  it("never draws from below the top 36, and ranks a high title likelier than a low one", () => {
    const r = labelReport(pool, labels, seeded(2), 500);
    expect(r.rows[2].chance).toBe(0);
    expect(r.rows[0].chance).toBeGreaterThan(r.rows[1].chance);
  });

  it("sums expected good and bad titles per draw", () => {
    const r = labelReport(pool, labels, seeded(3), 500);
    expect(r.expectedGood).toBeCloseTo(r.rows[0].chance);
    expect(r.expectedBad).toBeCloseTo(r.rows[1].chance + r.rows[2].chance + r.rows[3].chance);
  });
});
