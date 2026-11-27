import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  applyResultFilters,
  genresInResults,
  intersectIds,
  isSortOption,
  sortableTitle,
} from "./resultFilters";

const movies = [
  { id: 1, title: "The Office Movie", release_date: "2010-05-01", genre_ids: [35], vote_average: 7, vote_count: 500 },
  { id: 2, title: "Anchorman", release_date: "2004-07-09", genre_ids: [35, 18], vote_average: 7.2, vote_count: 3000 },
  { id: 3, title: "Despicable Me", release_date: "2010-07-08", genre_ids: [16, 35, 10751], vote_average: 7.3, vote_count: 15000 },
  { id: 4, title: "Untitled Project", release_date: "", genre_ids: [16], vote_average: 10, vote_count: 2 },
  { id: 5, title: "a Bigger Splash", release_date: "2015-09-06", genre_ids: [18], vote_average: 6.4, vote_count: 800 },
];
const ids = (arr: { id: number }[]) => arr.map((x) => x.id);

describe("applyResultFilters", () => {
  it("keeps the given order for relevance", () => {
    expect(ids(applyResultFilters(movies, DEFAULT_FILTERS))).toEqual([1, 2, 3, 4, 5]);
  });

  it("sorts newest and oldest first, with undated items last both ways", () => {
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "newest" }))).toEqual([5, 3, 1, 2, 4]);
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "oldest" }))).toEqual([2, 1, 3, 5, 4]);
  });

  it("sorts alphabetically ignoring leading articles and case", () => {
    // Anchorman, Bigger Splash, Despicable Me, Office Movie, Untitled Project
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "az" }))).toEqual([2, 5, 3, 1, 4]);
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "za" }))).toEqual([4, 1, 3, 5, 2]);
  });

  it("puts items with too few votes after rated ones", () => {
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "rating" }))).toEqual([3, 2, 1, 5, 4]);
  });

  it("works for TV shows (name / first_air_date)", () => {
    const shows = [
      { id: 10, name: "The Office", first_air_date: "2005-03-24" },
      { id: 11, name: "Space Force", first_air_date: "2020-05-29" },
    ];
    expect(ids(applyResultFilters(shows, { ...DEFAULT_FILTERS, sort: "newest" }))).toEqual([11, 10]);
    expect(ids(applyResultFilters(shows, { ...DEFAULT_FILTERS, sort: "az" }))).toEqual([10, 11]);
  });

  it("keeps only items with every selected genre", () => {
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, genreIds: [35] }))).toEqual([1, 2, 3]);
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, genreIds: [35, 16] }))).toEqual([3]);
  });

  it("restricts to onlyIds when given", () => {
    expect(ids(applyResultFilters(movies, { ...DEFAULT_FILTERS, onlyIds: new Set([2, 3, 99]) }))).toEqual([2, 3]);
  });

  it("does not mutate the input", () => {
    const copy = [...movies];
    applyResultFilters(movies, { ...DEFAULT_FILTERS, sort: "za" });
    expect(movies).toEqual(copy);
  });
});

describe("sortableTitle", () => {
  it("strips one leading article", () => {
    expect(sortableTitle("The Office")).toBe("Office");
    expect(sortableTitle("An American Tail")).toBe("American Tail");
    expect(sortableTitle("Theory of Everything")).toBe("Theory of Everything");
  });
});

describe("genresInResults", () => {
  it("counts genres, most common first, skipping unknown ids", () => {
    expect(genresInResults(movies, { 35: "Comedy", 16: "Animation", 18: "Drama" })).toEqual([
      { id: 35, name: "Comedy", count: 3 },
      { id: 16, name: "Animation", count: 2 },
      { id: 18, name: "Drama", count: 2 },
    ]);
  });
});

describe("intersectIds", () => {
  it("returns null with no lists and the shared ids otherwise", () => {
    expect(intersectIds([])).toBeNull();
    expect(intersectIds([[{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }]])).toEqual(new Set([2]));
  });
});

describe("isSortOption", () => {
  it("accepts known values only", () => {
    expect(isSortOption("az")).toBe(true);
    expect(isSortOption("bogus")).toBe(false);
    expect(isSortOption(null)).toBe(false);
  });
});
