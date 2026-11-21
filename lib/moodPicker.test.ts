import { describe, expect, it } from "vitest";
import {
  DEFAULT_SELECTION,
  candidateKey,
  matchesDiscoverParams,
  mediaTypesFor,
  moodSelectionToQuery,
  moodToDiscoverParams,
  parseMoodSelection,
  pickRecommendations,
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

  it("short means <100 min movies and ≤30 min episodes", () => {
    expect(moodToDiscoverParams(sel({ short: true }), "movie", ctx)["with_runtime.lte"]).toBe("100");
    expect(moodToDiscoverParams(sel({ short: true }), "tv", ctx)["with_runtime.lte"]).toBe("30");
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
    const s = sel({ vibe: "light", short: true, onMyServices: true, media: "tv" });
    expect(parseMoodSelection(new URLSearchParams(moodSelectionToQuery(s)))).toEqual(s);
  });

  it("falls back to defaults for junk values", () => {
    expect(parseMoodSelection(new URLSearchParams("vibe=sad&media=books&short=yes"))).toEqual(
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

  it("checks runtime, and rejects unknown runtime when short is picked", () => {
    expect(matchesDiscoverParams(params({ short: true }), facts)).toBe(true);
    expect(matchesDiscoverParams(params({ short: true }), { ...facts, runtime: 140 })).toBe(false);
    expect(matchesDiscoverParams(params({ short: true }), { ...facts, runtime: null })).toBe(false);
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

describe("pickRecommendations — movie/TV mix", () => {
  const item = (id: number, mediaType: "movie" | "tv"): MoodCandidate => ({
    id, mediaType, title: `${mediaType}${id}`, posterPath: "/p.jpg", date: "2024-01-01",
    overview: "", popularity: 1, voteAverage: 7,
  });
  // Movie-heavy pool, like a real "Both" pool where movies outnumber shows
  const pool = [
    ...Array.from({ length: 30 }, (_, i) => item(i + 1, "movie")),
    ...Array.from({ length: 5 }, (_, i) => item(i + 1, "tv")),
  ];
  const count = (picks: { mediaType: string }[], t: string) => picks.filter((p) => p.mediaType === t).length;

  it("includes both movies and TV when the pool has both", () => {
    for (let seed = 0; seed < 20; seed++) {
      let s = seed;
      const random = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
      const picks = pickRecommendations(pool, { watchlist: new Set(), exclude: new Set(), random });
      expect(count(picks, "movie")).toBeGreaterThanOrEqual(2);
      expect(count(picks, "tv")).toBeGreaterThanOrEqual(2);
    }
  });

  it("still mixes when every watchlist match is a movie", () => {
    const watchlist = new Set(["movie-1", "movie-2", "movie-3", "movie-4", "movie-5"]);
    const picks = pickRecommendations(pool, { watchlist, exclude: new Set() });
    expect(count(picks, "tv")).toBeGreaterThanOrEqual(2);
    expect(picks.filter((p) => p.onWatchlist).length).toBeGreaterThanOrEqual(2);
  });

  it("fills from the other type when one runs out", () => {
    const picks = pickRecommendations([...pool.slice(0, 10), item(1, "tv")], {
      watchlist: new Set(), exclude: new Set(),
    });
    expect(picks).toHaveLength(5);
    expect(count(picks, "tv")).toBe(1);
  });
});
