import { describe, expect, it } from "vitest";
import { PAIRS } from "./pair-personas";

// Guards the fixtures only (no network): a typo here would silently skew the eval.
describe("pair persona fixtures", () => {
  it("has the six pairs from the spec, with unique ids", () => {
    expect(PAIRS).toHaveLength(6);
    expect(new Set(PAIRS.map((p) => p.id)).size).toBe(6);
  });

  it("has no duplicate title within a person and only valid ratings", () => {
    for (const pair of PAIRS) {
      for (const person of [pair.a, pair.b]) {
        const keys = person.titles.map((x) => `${x.media}-${x.id}`);
        expect(new Set(keys).size, `${pair.id} ${person.name}`).toBe(keys.length);
        for (const x of person.titles) {
          expect([undefined, 1, 2, 3]).toContain(x.rating);
          expect(x.rating !== undefined || x.want, `${x.title} needs a rating or want`).toBe(true);
        }
      }
    }
  });

  it("makes the movie/TV pair really one-type each", () => {
    const pair = PAIRS.find((p) => p.id === "movie-tv")!;
    expect(pair.a.titles.every((x) => x.media === "movie")).toBe(true);
    expect(pair.b.titles.every((x) => x.media === "tv")).toBe(true);
  });

  it("makes the cold-start pairs cold (under 5 signals)", () => {
    for (const id of ["one-cold", "both-cold"]) {
      const pair = PAIRS.find((p) => p.id === id)!;
      expect(pair.b.titles.length).toBeLessThan(5);
    }
  });
});
