import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTION,
  blendPools,
  candidateKey,
  matchesDiscoverParams,
  mediaTypesFor,
  moodSelectionToQuery,
  moodToDiscoverParams,
  parseMoodSelection,
  pickRecommendations,
  traitScore,
  type MoodCandidate,
  type MoodSelection,
} from "./moodPicker";

// A fixed "today" keeps date filters deterministic.
const ctx = { today: new Date("2026-06-15T12:00:00Z"), providerIds: [] as number[] };
const sel = (over: Partial<MoodSelection>): MoodSelection => ({ ...DEFAULT_SELECTION, ...over });

describe("moodToDiscoverParams", () => {
  it("applies only a quality floor when nothing is picked", () => {
    const p = moodToDiscoverParams(DEFAULT_SELECTION, "movie", ctx);
    expect(p).toEqual({ sort_by: "popularity.desc", "vote_average.gte": "6.5", "vote_count.gte": "300" });
  });

  it("always excludes daytime/reality TV genres", () => {
    const p = moodToDiscoverParams(DEFAULT_SELECTION, "tv", ctx);
    expect(p.without_genres?.split(",")).toEqual(
      expect.arrayContaining(["10763", "10764", "10766", "10767"])
    );
  });

  it("light → comedy/family genres (any of), no horror or war", () => {
    const p = moodToDiscoverParams(sel({ vibe: "light" }), "movie", ctx);
    expect(p.with_genres?.split("|")).toEqual(expect.arrayContaining(["35", "10751"]));
    expect(p.without_genres?.split(",")).toEqual(expect.arrayContaining(["27", "10752"]));
  });

  it("intense → thriller/action genres, no comedy or family", () => {
    const p = moodToDiscoverParams(sel({ vibe: "intense" }), "movie", ctx);
    expect(p.with_genres?.split("|")).toEqual(expect.arrayContaining(["53", "28"]));
    expect(p.without_genres?.split(",")).toEqual(expect.arrayContaining(["35", "10751"]));
  });

  it("uses TV genre IDs for TV (TMDB has no Thriller genre for TV)", () => {
    const p = moodToDiscoverParams(sel({ vibe: "intense" }), "tv", ctx);
    expect(p.with_genres).not.toContain("53");
    expect(p.with_genres?.split("|")).toContain("80");
  });

  it("time available is one runtime rule, the same for movies and TV", () => {
    for (const media of ["movie", "tv"] as const) {
      const half = moodToDiscoverParams(sel({ time: "30" }), media, ctx);
      expect(half["with_runtime.lte"]).toBe("30");
      expect(half["with_runtime.gte"]).toBe("10"); // skip clips
      expect(moodToDiscoverParams(sel({ time: "120" }), media, ctx)["with_runtime.lte"]).toBe("120");
      expect(moodToDiscoverParams(sel({ time: "any" }), media, ctx)).not.toHaveProperty("with_runtime.lte");
    }
  });

  it("something new → last 12 months, with a lower vote floor", () => {
    const movie = moodToDiscoverParams(sel({ fresh: true }), "movie", ctx);
    expect(movie["primary_release_date.gte"]).toBe("2025-06-15");
    expect(movie["primary_release_date.lte"]).toBe("2026-06-15");
    expect(movie["vote_count.gte"]).toBe("50");

    const tv = moodToDiscoverParams(sel({ fresh: true }), "tv", ctx);
    expect(tv["first_air_date.gte"]).toBe("2025-06-15");
    expect(tv).not.toHaveProperty("primary_release_date.gte");
  });

  it("on my services → watch providers incl. tier IDs, region and flatrate", () => {
    const p = moodToDiscoverParams(sel({ onMyServices: true }), "movie", {
      ...ctx,
      providerIds: [8, 2303], // Netflix, Paramount+ (which has an extra tier ID)
    });
    expect(p.with_watch_providers?.split("|").sort()).toEqual(["2303", "2616", "8"]);
    expect(p.watch_region).toBe("US");
    expect(p.with_watch_monetization_types).toBe("flatrate");
  });

  it("ignores on my services when the user hasn't saved any", () => {
    const p = moodToDiscoverParams(sel({ onMyServices: true }), "movie", ctx);
    expect(p).not.toHaveProperty("with_watch_providers");
  });
});

describe("parseMoodSelection / moodSelectionToQuery", () => {
  it("round-trips a selection", () => {
    const s = sel({ vibe: "light", time: "30", onMyServices: true, media: "tv" });
    expect(parseMoodSelection(new URLSearchParams(moodSelectionToQuery(s)))).toEqual(s);
  });

  it("falls back to defaults for junk values", () => {
    expect(parseMoodSelection(new URLSearchParams("vibe=sad&media=books&time=45"))).toEqual(
      DEFAULT_SELECTION
    );
  });

  it("expands 'both' into movie and tv", () => {
    expect(mediaTypesFor("both")).toEqual(["movie", "tv"]);
    expect(mediaTypesFor("tv")).toEqual(["tv"]);
  });
});

describe("pickRecommendations", () => {
  const make = (id: number, mediaType: "movie" | "tv" = "movie"): MoodCandidate => ({
    id,
    mediaType,
    title: `T${id}`,
    posterPath: `/p${id}.jpg`,
    date: "2024-01-01",
    overview: "",
    popularity: 100 - id,
    voteAverage: 7,
  });
  const pool = Array.from({ length: 10 }, (_, i) => make(i + 1));
  const keys = (ids: number[]) => new Set(ids.map((id) => candidateKey(make(id))));
  // Deterministic "random" — always picks the first remaining slot
  const noShuffle = () => 0.999999;

  it("returns 5 by default", () => {
    expect(pickRecommendations(pool, { watchlist: new Set(), exclude: new Set() })).toHaveLength(5);
  });

  it("never includes excluded (already watched) titles", () => {
    const picks = pickRecommendations(pool, {
      watchlist: new Set(),
      exclude: keys([1, 2, 3, 4, 5, 6, 7]),
    });
    expect(picks.map((p) => p.id).sort()).toEqual([10, 8, 9].sort());
  });

  it("puts watchlist titles first and flags them", () => {
    const picks = pickRecommendations(pool, {
      watchlist: keys([9, 4]),
      exclude: new Set(),
      random: noShuffle,
    });
    expect(picks.slice(0, 2).map((p) => p.id).sort()).toEqual([4, 9]);
    expect(picks.slice(0, 2).every((p) => p.onWatchlist)).toBe(true);
    expect(picks.slice(2).some((p) => p.onWatchlist)).toBe(false);
  });

  it("shuffle avoids titles currently on screen while there are others", () => {
    const first = pickRecommendations(pool, { watchlist: new Set(), exclude: new Set() });
    const next = pickRecommendations(pool, {
      watchlist: new Set(),
      exclude: new Set(),
      avoid: new Set(first.map(candidateKey)),
    });
    const overlap = next.filter((p) => first.some((f) => f.id === p.id));
    expect(overlap).toHaveLength(0);
  });

  it("refills from shown titles when the pool is small", () => {
    const small = pool.slice(0, 3);
    const picks = pickRecommendations(small, {
      watchlist: new Set(),
      exclude: new Set(),
      avoid: new Set(small.map(candidateKey)),
    });
    expect(picks).toHaveLength(3);
  });

  it("treats a movie and a TV show with the same ID as different titles", () => {
    const picks = pickRecommendations([make(1, "movie"), make(1, "tv"), make(1, "movie")], {
      watchlist: new Set(),
      exclude: new Set(["tv-1"]),
    });
    expect(picks.map(candidateKey)).toEqual(["movie-1"]);
  });

  it("skips titles without a poster", () => {
    const picks = pickRecommendations([{ ...make(1), posterPath: null }, make(2)], {
      watchlist: new Set(),
      exclude: new Set(),
    });
    expect(picks.map((p) => p.id)).toEqual([2]);
  });
});

describe("matchesDiscoverParams", () => {
  const facts = {
    genreIds: [35, 18],
    runtime: 95,
    date: "2026-01-10",
    voteAverage: 7.2,
    providerIds: [8],
  };
  const params = (over: Partial<MoodSelection>, providerIds: number[] = []) =>
    moodToDiscoverParams(sel(over), "movie", { ...ctx, providerIds });

  it("matches with no moods picked", () => {
    expect(matchesDiscoverParams(params({}), facts)).toBe(true);
  });

  it("checks genre include/exclude lists", () => {
    expect(matchesDiscoverParams(params({ vibe: "light" }), facts)).toBe(true);
    expect(matchesDiscoverParams(params({ vibe: "intense" }), facts)).toBe(false); // comedy excluded
    expect(matchesDiscoverParams(params({ vibe: "light" }), { ...facts, genreIds: [35, 27] })).toBe(false);
  });

  it("checks runtime, and rejects unknown runtime when time is limited", () => {
    expect(matchesDiscoverParams(params({ time: "120" }), facts)).toBe(true);
    expect(matchesDiscoverParams(params({ time: "120" }), { ...facts, runtime: 140 })).toBe(false);
    expect(matchesDiscoverParams(params({ time: "30" }), facts)).toBe(false); // a 95-min film
    expect(matchesDiscoverParams(params({ time: "120" }), { ...facts, runtime: null })).toBe(false);
  });

  it("checks the release window", () => {
    expect(matchesDiscoverParams(params({ fresh: true }), facts)).toBe(true);
    expect(matchesDiscoverParams(params({ fresh: true }), { ...facts, date: "2019-05-01" })).toBe(false);
  });

  it("checks streaming providers", () => {
    expect(matchesDiscoverParams(params({ onMyServices: true }, [8]), facts)).toBe(true);
    expect(matchesDiscoverParams(params({ onMyServices: true }, [337]), facts)).toBe(false);
  });

  it("applies the rating floor but not the vote-count floor", () => {
    expect(matchesDiscoverParams(params({}), { ...facts, voteAverage: 5.1 })).toBe(false);
    expect(matchesDiscoverParams(params({}), { ...facts, voteAverage: 0 })).toBe(true); // unrated
  });
});

describe("traits, not quotas — movies and TV compete on the same terms", () => {
  const item = (
    id: number,
    mediaType: "movie" | "tv",
    genreIds: number[],
    voteAverage = 7.5,
    voteCount = 2000
  ): MoodCandidate => ({
    id, mediaType, title: `${mediaType}${id}`, posterPath: "/p.jpg", date: "2024-01-01",
    overview: "", popularity: 1, voteAverage, voteCount, genreIds,
  });
  const light = sel({ vibe: "light" });
  const seeded = (seed: number) => () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  // Share of picks that are TV across many shuffles
  const tvShare = (pool: MoodCandidate[], selection: MoodSelection) => {
    const random = seeded(1);
    let tv = 0;
    for (let i = 0; i < 200; i++) {
      const picks = pickRecommendations(pool, { watchlist: new Set(), exclude: new Set(), selection, random });
      tv += picks.filter((p) => p.mediaType === "tv").length;
    }
    return tv / 1000;
  };

  it("scores a pure comedy as lighter than a comedy-thriller, whatever its type", () => {
    const sitcom = item(1, "tv", [35]);
    const comedyThriller = item(2, "movie", [35, 53, 80]);
    expect(traitScore(sitcom, light)).toBeGreaterThan(traitScore(comedyThriller, light));
  });

  it("scores a well-rated title above a poorly-rated one, discounting few votes", () => {
    expect(traitScore(item(1, "movie", [35], 8.2))).toBeGreaterThan(traitScore(item(2, "movie", [35], 6.6)));
    // 9.5 from 20 votes is mostly noise; 8.4 from 20k is a sure thing
    expect(traitScore(item(1, "movie", [35], 8.4, 20000))).toBeGreaterThan(
      traitScore(item(2, "movie", [35], 9.5, 20))
    );
  });

  it("doesn't force TV in when the movies fit the mood better", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "movie", [35, 10751], 8.0)), // family comedies
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "tv", [35, 80, 10759], 6.6)), // crime-action comedies
    ];
    expect(tvShare(pool, light)).toBeLessThan(0.3);
  });

  it("lets TV win when the shows fit the mood better", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "movie", [35, 28, 80], 6.6)),
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "tv", [35, 10751], 8.0)),
    ];
    expect(tvShare(pool, light)).toBeGreaterThan(0.7);
  });

  it("gives an even split when movies and shows fit equally — no type preference", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "movie", [35])),
      ...Array.from({ length: 10 }, (_, i) => item(i + 1, "tv", [35])),
    ];
    const share = tvShare(pool, light);
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });

  it("still puts watchlist titles first, regardless of score", () => {
    const pool = [item(1, "movie", [35, 10751], 8.5), item(2, "tv", [80, 53], 6.6)];
    const picks = pickRecommendations(pool, {
      watchlist: new Set(["tv-2"]), exclude: new Set(), selection: light, count: 1,
    });
    expect(picks[0].id).toBe(2);
  });
});

describe("blendPools — no hidden quota when building the pool", () => {
  const items = (n: number, mediaType: "movie" | "tv"): MoodCandidate[] =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1, mediaType, title: "", posterPath: "/p.jpg", date: "", overview: "", popularity: n - i, voteAverage: 7,
    }));

  it("sizes each type by how many titles matched, not 50/50", () => {
    // "~30 min": ~790 shows match but only ~80 short films
    const pool = blendPools(
      [
        { candidates: items(60, "movie"), total: 80 },
        { candidates: items(60, "tv"), total: 790 },
      ],
      60
    );
    const movies = pool.filter((c) => c.mediaType === "movie").length;
    expect(movies).toBe(6); // 80 / 870 of 60, rounded up
    expect(pool).toHaveLength(60);
  });

  it("keeps each type's most popular titles", () => {
    const pool = blendPools([{ candidates: items(10, "movie"), total: 100 }, { candidates: items(10, "tv"), total: 100 }], 4);
    expect(pool.map((c) => c.id).sort()).toEqual([1, 1, 2, 2]);
  });

  it("gives an even split when match counts are even", () => {
    const pool = blendPools([{ candidates: items(60, "movie"), total: 500 }, { candidates: items(60, "tv"), total: 500 }], 60);
    expect(pool.filter((c) => c.mediaType === "tv")).toHaveLength(30);
  });

  it("tops up from the other type when one runs short", () => {
    const pool = blendPools([{ candidates: items(3, "movie"), total: 900 }, { candidates: items(60, "tv"), total: 100 }], 20);
    expect(pool).toHaveLength(20);
    expect(pool.filter((c) => c.mediaType === "movie")).toHaveLength(3);
  });
});
