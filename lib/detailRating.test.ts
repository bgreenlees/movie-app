import { describe, expect, it } from "vitest";
import { buildRateRequest, nextRating, normalizeRating } from "./detailRating";

describe("normalizeRating", () => {
  it("keeps 1–3 and maps everything else to 0", () => {
    expect([1, 2, 3].map(normalizeRating)).toEqual([1, 2, 3]);
    expect([0, 4, -1, 2.5, null, undefined].map(normalizeRating)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("nextRating", () => {
  it("clears when the selected thumb is tapped again", () => {
    expect(nextRating(2, 2)).toBe(0);
  });
  it("switches or sets otherwise", () => {
    expect(nextRating(2, 3)).toBe(3);
    expect(nextRating(0, 1)).toBe(1);
  });
});

describe("buildRateRequest", () => {
  it("PATCHes the existing movie entry", () => {
    expect(buildRateRequest("movie", 5, "abc", 3)).toEqual({
      url: "/api/watchlist/abc",
      method: "PATCH",
      body: { rating: 3 },
    });
  });
  it("clears with null on an existing TV entry", () => {
    expect(buildRateRequest("tv", 9, "t1", 0)).toEqual({
      url: "/api/tv/watchlist/t1",
      method: "PATCH",
      body: { rating: null },
    });
  });
  it("adds an unlisted movie as Watched with the rating", () => {
    expect(buildRateRequest("movie", 5, null, 2)).toEqual({
      url: "/api/watchlist",
      method: "POST",
      body: { movieId: 5, status: "WATCHED", rating: 2 },
    });
  });
  it("adds an unlisted TV show as Watched with the rating", () => {
    expect(buildRateRequest("tv", 9, null, 1)).toEqual({
      url: "/api/tv/watchlist",
      method: "POST",
      body: { tvShowId: 9, status: "WATCHED", rating: 1 },
    });
  });
  it("does nothing when clearing a rating on an unlisted title", () => {
    expect(buildRateRequest("movie", 5, null, 0)).toBeNull();
  });
});
