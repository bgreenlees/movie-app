import { describe, expect, it } from "vitest";
import {
  FRESH_SEEDS,
  SHELF_SIZE,
  buildShelves,
  freshSeeds,
  rankFreshPicks,
  shelfKey,
  type ShelfEntry,
  type ShelfItem,
} from "./watchTogetherShelves";

let t = 0;
const e = (
  mediaType: "movie" | "tv",
  tmdbId: number,
  status: string,
  rating: number | null = null,
  addedAt = ++t
): ShelfEntry => ({ mediaType, tmdbId, status, rating, addedAt, title: `${mediaType} ${tmdbId}`, posterPath: "/p.jpg", date: "2024-01-01" });

const keys = (items: { mediaType: "movie" | "tv"; id: number }[]) => items.map(shelfKey);

describe("buildShelves", () => {
  it("includes TV in every shelf", () => {
    const mine = [e("movie", 1, "WANT_TO_WATCH"), e("tv", 10, "WANT_TO_WATCH"), e("tv", 20, "WATCHED", 3)];
    const theirs = [e("movie", 1, "WANT_TO_WATCH"), e("tv", 10, "WANT_TO_WATCH"), e("tv", 30, "WATCHED", 3)];
    const s = buildShelves(mine, theirs);
    expect(keys(s.bothWantToWatch).sort()).toEqual(["movie-1", "tv-10"]);
    expect(keys(s.friendLovedForMe)).toEqual(["tv-30"]);
    expect(keys(s.iLovedForFriend)).toEqual(["tv-20"]);
  });

  it("keeps movie and TV ids apart", () => {
    // Movie 5 and show 5 are different titles
    const s = buildShelves([e("movie", 5, "WANT_TO_WATCH")], [e("tv", 5, "WANT_TO_WATCH")]);
    expect(s.bothWantToWatch).toEqual([]);
  });

  it("skips loved titles already on the other person's lists", () => {
    const s = buildShelves([e("tv", 1, "NOT_INTERESTED")], [e("tv", 1, "WATCHED", 3)]);
    expect(s.friendLovedForMe).toEqual([]);
  });

  it("ignores out-of-range ratings (F5) and dislikes", () => {
    const theirs = [e("movie", 1, "WATCHED", 999), e("movie", 2, "WATCHED", 1), e("movie", 3, "WATCHED", 2)];
    expect(keys(buildShelves([], theirs).friendLovedForMe)).toEqual(["movie-3"]);
  });

  it("orders Loves before Likes, then newest, capped", () => {
    const theirs = [
      e("movie", 1, "WATCHED", 2, 100),
      e("tv", 2, "WATCHED", 3, 1),
      e("movie", 3, "WATCHED", 3, 50),
      ...Array.from({ length: 20 }, (_, i) => e("tv", 100 + i, "WATCHED", 2, i)),
    ];
    const loved = buildShelves([], theirs).friendLovedForMe;
    expect(keys(loved).slice(0, 3)).toEqual(["movie-3", "tv-2", "movie-1"]);
    expect(loved).toHaveLength(SHELF_SIZE);
  });
});

describe("freshSeeds", () => {
  it("uses titles both liked, of either type, Loves first, capped", () => {
    const mine = [
      e("movie", 1, "WATCHED", 2),
      e("tv", 2, "WATCHED", 3),
      e("movie", 3, "WATCHED", 3),
      e("movie", 4, "WATCHED", 1),
      ...Array.from({ length: 10 }, (_, i) => e("movie", 100 + i, "WATCHED", 2)),
    ];
    const theirs = [
      e("movie", 1, "WATCHED", 2),
      e("tv", 2, "WATCHED", 3),
      e("movie", 3, "WATCHED", 2),
      e("movie", 4, "WATCHED", 3),
      ...Array.from({ length: 10 }, (_, i) => e("movie", 100 + i, "WATCHED", 2)),
    ];
    const seeds = freshSeeds(mine, theirs);
    expect(seeds).toHaveLength(FRESH_SEEDS);
    expect(seeds[0]).toEqual({ mediaType: "tv", tmdbId: 2 });
    expect(seeds[1]).toEqual({ mediaType: "movie", tmdbId: 3 });
    expect(seeds).not.toContainEqual({ mediaType: "movie", tmdbId: 4 }); // I disliked it
  });

  it("ignores a 999 rating", () => {
    expect(freshSeeds([e("movie", 1, "WATCHED", 999)], [e("movie", 1, "WATCHED", 3)])).toEqual([]);
  });
});

describe("rankFreshPicks", () => {
  const item = (mediaType: "movie" | "tv", id: number, posterPath: string | null = "/p.jpg"): ShelfItem => ({
    id, mediaType, title: `${id}`, posterPath, date: null,
  });

  it("ranks titles recommended by more seeds first and drops excluded or posterless ones", () => {
    const lists = [
      [item("movie", 1), item("movie", 2), item("tv", 9, null)],
      [item("tv", 3), item("movie", 2)],
    ];
    const picks = rankFreshPicks(lists, new Set(["movie-1"]));
    expect(keys(picks)).toEqual(["movie-2", "tv-3"]);
  });
});
