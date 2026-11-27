import { describe, expect, it } from "vitest";
import {
  EMPTY_PROFILE,
  affinity,
  buildTasteProfile,
  entrySignal,
  pairFit,
  pairScore,
  sourceBoost,
  type TasteCandidate,
  type TasteEntry,
} from "./pairTaste";

// TMDB genre ids used below
const M = { scifi: 878, drama: 18, comedy: 35, family: 10751, horror: 27, fantasy: 14 };
const TV = { scifiFantasy: 10765, drama: 18, comedy: 35, mystery: 9648 };

const love = (mediaType: "movie" | "tv", genreIds: number[]): TasteEntry => ({
  mediaType,
  status: "WATCHED",
  rating: 3,
  genreIds,
});

describe("entrySignal", () => {
  it("uses the §5.1 weights", () => {
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 3 })).toBe(1.0);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 2 })).toBe(0.6);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 1 })).toBe(-1.0);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED" })).toBe(0.2);
    expect(entrySignal({ mediaType: "movie", status: "WANT_TO_WATCH" })).toBe(0.4);
    expect(entrySignal({ mediaType: "tv", status: "WATCHING" })).toBe(0.4);
    expect(entrySignal({ mediaType: "tv", status: "NOT_INTERESTED" })).toBe(-0.6);
  });

  it("ignores ratings outside 1–3 (rating 999 counts as unrated, not as a Love)", () => {
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 999 })).toBe(0.2);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 0 })).toBe(0.2);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: -5 })).toBe(0.2);
    expect(entrySignal({ mediaType: "movie", status: "WATCHED", rating: 2.5 })).toBe(0.2);
  });
});

describe("buildTasteProfile", () => {
  it("rating 999 is ignored: the profile equals one built from an unrated watch", () => {
    const junk = buildTasteProfile([{ mediaType: "movie", status: "WATCHED", rating: 999, genreIds: [M.scifi] }]);
    const unrated = buildTasteProfile([{ mediaType: "movie", status: "WATCHED", genreIds: [M.scifi] }]);
    expect(junk).toEqual(unrated);
    expect(junk.weights.scifi).toBeCloseTo(0.2 / 3);
  });

  it("shrinks rarely-seen traits: w = Σ signal / (n + 2)", () => {
    const p = buildTasteProfile([love("movie", [M.scifi]), love("movie", [M.scifi, M.drama])]);
    expect(p.weights.scifi).toBeCloseTo(2 / 4);
    expect(p.weights.drama).toBeCloseTo(1 / 3);
  });

  it("skips titles without cached genres and flags cold start under 5 signals", () => {
    const p = buildTasteProfile([
      love("movie", [M.scifi]),
      { mediaType: "movie", status: "WATCHED", rating: 3, genreIds: null },
      { mediaType: "tv", status: "WATCHED", rating: 3, genreIds: [] },
    ]);
    expect(p.signals).toBe(1);
    expect(p.coldStart).toBe(true);
    const five = buildTasteProfile(Array.from({ length: 5 }, () => love("movie", [M.scifi])));
    expect(five.coldStart).toBe(false);
  });
});

describe("affinity", () => {
  it("an empty profile gives exactly 0.5 for anything", () => {
    expect(EMPTY_PROFILE.signals).toBe(0);
    expect(affinity(EMPTY_PROFILE, { mediaType: "movie", genreIds: [M.scifi, M.drama] })).toBe(0.5);
    expect(affinity(EMPTY_PROFILE, { mediaType: "tv", genreIds: [TV.comedy] })).toBe(0.5);
    expect(affinity(EMPTY_PROFILE, { mediaType: "tv", genreIds: [] })).toBe(0.5);
  });

  it("a movie Love lifts a TV title with the same traits, as much as a movie", () => {
    // Loves for Arrival-like films (sci-fi drama)
    const profile = buildTasteProfile(Array.from({ length: 6 }, () => love("movie", [M.scifi, M.drama])));
    const severanceLike = affinity(profile, { mediaType: "tv", genreIds: [TV.scifiFantasy, TV.drama] });
    const sitcom = affinity(profile, { mediaType: "tv", genreIds: [TV.comedy] });
    const sameTraitsFilm = affinity(profile, { mediaType: "movie", genreIds: [M.scifi, M.fantasy, M.drama] });

    expect(severanceLike).toBeGreaterThan(0.5);
    expect(severanceLike).toBeGreaterThan(sitcom);
    expect(severanceLike).toBeCloseTo(sameTraitsFilm); // no type term
  });

  it("a Didn't like pushes same-trait titles below neutral", () => {
    const profile = buildTasteProfile(
      Array.from({ length: 10 }, () => ({ mediaType: "movie", status: "WATCHED", rating: 1, genreIds: [M.horror] }) as TasteEntry),
    );
    expect(affinity(profile, { mediaType: "movie", genreIds: [M.horror] })).toBeLessThan(0.5);
  });

  it("little history shrinks towards 0.5", () => {
    const one = buildTasteProfile([love("movie", [M.scifi])]);
    const ten = buildTasteProfile(Array.from({ length: 10 }, () => love("movie", [M.scifi])));
    const c: TasteCandidate = { mediaType: "movie", genreIds: [M.scifi] };
    expect(affinity(one, c) - 0.5).toBeLessThan(affinity(ten, c) - 0.5);
    expect(affinity(one, c)).toBeGreaterThan(0.5);
  });

  it("scales by confidence c = signals / 10 (one Love → c = 0.1)", () => {
    // One Love (+1.0) on scifi: w.scifi = 1 / (1 + 2) = 1/3
    // raw = 0.5 + 0.5·tanh(1.5 · 1/3) = 0.5 + 0.5·tanh(0.5) ≈ 0.7311
    // affinity = 0.5 + 0.1 · (raw − 0.5) = 0.5 + 0.05·tanh(0.5) ≈ 0.5231
    const one = buildTasteProfile([love("movie", [M.scifi])]);
    expect(affinity(one, { mediaType: "movie", genreIds: [M.scifi] })).toBeCloseTo(0.5 + 0.05 * Math.tanh(0.5), 10);
  });

  it("being on their want list means at least 0.8, even with no history", () => {
    expect(affinity(EMPTY_PROFILE, { mediaType: "tv", genreIds: [TV.comedy], onWantList: true })).toBe(0.8);
  });

  it("stays within 0–1", () => {
    const fan = buildTasteProfile(Array.from({ length: 50 }, () => love("movie", [M.scifi])));
    const a = affinity(fan, { mediaType: "movie", genreIds: [M.scifi] });
    expect(a).toBeLessThanOrEqual(1);
    expect(a).toBeGreaterThanOrEqual(0);
  });
});

describe("pairFit", () => {
  it("ranks both-fine (0.7, 0.7) above one-thrilled-one-not (0.95, 0.3)", () => {
    expect(pairFit(0.7, 0.7)).toBeGreaterThan(pairFit(0.95, 0.3));
  });

  it("is least-misery weighted, not a plain average", () => {
    // A plain average would rank (0.95, 0.3) first: 0.625 > 0.6.
    // pairFit: 0.7·0.3 + 0.3·0.625 = 0.21 + 0.1875 = 0.3975, below 0.7·0.6 + 0.3·0.6 = 0.6
    expect(pairFit(0.6, 0.6)).toBeGreaterThan(pairFit(0.95, 0.3));
    expect(pairFit(0.95, 0.3)).toBeCloseTo(0.3975);
  });

  it("is symmetric and still rewards excitement when the minimum ties", () => {
    expect(pairFit(0.2, 0.9)).toBeCloseTo(pairFit(0.9, 0.2));
    expect(pairFit(0.6, 0.9)).toBeGreaterThan(pairFit(0.6, 0.6));
  });
});

describe("pairScore", () => {
  const fan = buildTasteProfile([
    ...Array.from({ length: 6 }, () => love("movie", [M.scifi, M.drama])),
    ...Array.from({ length: 4 }, () => ({ mediaType: "movie", status: "WATCHED", rating: 1, genreIds: [M.comedy] }) as TasteEntry),
  ]);
  const candidates: TasteCandidate[] = [
    { mediaType: "tv", genreIds: [TV.scifiFantasy, TV.drama] },
    { mediaType: "movie", genreIds: [M.drama] },
    { mediaType: "tv", genreIds: [TV.mystery] },
    { mediaType: "movie", genreIds: [M.comedy, M.family] },
    { mediaType: "tv", genreIds: [TV.comedy] },
  ];
  const rank = (scores: number[]) => scores.map((s, i) => [s, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);

  it("a cold-start partner doesn't change the other person's ranking", () => {
    const solo = candidates.map((c) => affinity(fan, c));
    const withNewcomer = candidates.map((c) =>
      pairScore({ affinityA: affinity(fan, c), affinityB: affinity(EMPTY_PROFILE, c), traitScore: 0.5, sourceBoost: 0 }),
    );
    expect(rank(withNewcomer)).toEqual(rank(solo));
  });

  it("weights pair fit, trait score and source boost 0.45 / 0.35 / 0.20", () => {
    expect(pairScore({ affinityA: 1, affinityB: 1, traitScore: 1, sourceBoost: 1 })).toBeCloseTo(1);
    expect(pairScore({ affinityA: 0, affinityB: 0, traitScore: 0, sourceBoost: 0 })).toBe(0);
    expect(pairScore({ affinityA: 0.5, affinityB: 0.5, traitScore: 0, sourceBoost: 0 })).toBeCloseTo(0.225);
  });
});

describe("sourceBoost", () => {
  it("uses the §5.1 values and takes the best source", () => {
    expect(sourceBoost({ wantedBy: 2, recSeededBy: 0 })).toBe(1.0);
    expect(sourceBoost({ wantedBy: 1, recSeededBy: 0 })).toBe(0.5);
    expect(sourceBoost({ wantedBy: 0, recSeededBy: 2 })).toBe(0.6);
    expect(sourceBoost({ wantedBy: 0, recSeededBy: 1 })).toBe(0.3);
    expect(sourceBoost({ wantedBy: 0, recSeededBy: 0 })).toBe(0);
    expect(sourceBoost({ wantedBy: 1, recSeededBy: 2 })).toBe(0.6);
  });
});
