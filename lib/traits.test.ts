import { describe, expect, it } from "vitest";
import { genreIdsFromJson, traitsFor } from "./traits";

describe("traitsFor", () => {
  it("maps TV Sci-Fi & Fantasy onto the movie Sci-Fi and Fantasy traits", () => {
    expect(traitsFor("tv", [10765]).sort()).toEqual(["fantasy", "scifi"]);
    expect(traitsFor("movie", [878])).toEqual(["scifi"]);
    expect(traitsFor("movie", [14])).toEqual(["fantasy"]);
  });

  it("maps the other merged and TV-only genres per the spec", () => {
    expect(traitsFor("tv", [10759]).sort()).toEqual(["action", "adventure"]);
    expect(traitsFor("tv", [10768])).toEqual(["war"]);
    expect(traitsFor("movie", [10751])).toEqual(["family"]);
    expect(traitsFor("tv", [10751])).toEqual(["family"]);
    expect(traitsFor("tv", [10762])).toEqual(["family"]);
  });

  it("keeps movie-only genres as traits", () => {
    expect(traitsFor("movie", [53, 27])).toEqual(["thriller", "horror"]);
  });

  it("reads ids by media type (TV 10759 isn't a movie genre)", () => {
    expect(traitsFor("movie", [10759])).toEqual([]);
  });

  it("dedupes and skips unknown ids", () => {
    expect(traitsFor("tv", [10751, 10762, 424242])).toEqual(["family"]);
    expect(traitsFor("movie", [])).toEqual([]);
  });
});

describe("genreIdsFromJson", () => {
  it("reads TMDB's cached [{ id, name }] shape and plain id arrays", () => {
    expect(genreIdsFromJson([{ id: 18, name: "Drama" }, { id: 878, name: "Science Fiction" }])).toEqual([18, 878]);
    expect(genreIdsFromJson([35, 18])).toEqual([35, 18]);
  });

  it("returns [] for null or malformed data", () => {
    expect(genreIdsFromJson(null)).toEqual([]);
    expect(genreIdsFromJson("drama")).toEqual([]);
    expect(genreIdsFromJson([null, { id: "18" }, { name: "x" }, 1.5])).toEqual([]);
  });
});
