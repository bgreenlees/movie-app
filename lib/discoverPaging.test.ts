import { describe, expect, it } from "vitest";
import { discoverEndpoint, mergePage, parsePage, trimToFullRows, MAX_DISCOVER_PAGE, type DiscoverMode } from "./discoverPaging";

describe("parsePage", () => {
  it("defaults to page 1 when missing", () => {
    expect(parsePage(null)).toBe(1);
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage("")).toBe(1);
  });
  it("accepts 1 through the cap", () => {
    expect(parsePage("1")).toBe(1);
    expect(parsePage("7")).toBe(7);
    expect(parsePage(String(MAX_DISCOVER_PAGE))).toBe(MAX_DISCOVER_PAGE);
  });
  it("rejects out-of-range and non-integer values", () => {
    for (const bad of ["0", "-1", String(MAX_DISCOVER_PAGE + 1), "2.5", "abc", "1e2", " 3", "0x10", "99999"]) {
      expect(parsePage(bad), bad).toBeNull();
    }
  });
});

describe("mergePage", () => {
  it("appends new titles in order", () => {
    expect(mergePage([{ id: 1 }, { id: 2 }], [{ id: 3 }, { id: 4 }]).map((t) => t.id)).toEqual([1, 2, 3, 4]);
  });
  it("drops ids already loaded and repeats within the new page", () => {
    expect(mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }, { id: 3 }]).map((t) => t.id)).toEqual([1, 2, 3]);
  });
  it("returns the same array when nothing is new", () => {
    const existing = [{ id: 1 }];
    expect(mergePage(existing, [{ id: 1 }])).toBe(existing);
  });
});

describe("trimToFullRows", () => {
  it("cuts only the ragged tail", () => {
    expect(trimToFullRows([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("keeps a complete grid whole", () => {
    expect(trimToFullRows([1, 2, 3, 4], 2)).toEqual([1, 2, 3, 4]);
  });
  it("returns a list shorter than one row whole", () => {
    expect(trimToFullRows([1, 2], 6)).toEqual([1, 2]);
  });
});

describe("discoverEndpoint", () => {
  const base: DiscoverMode = { mediaType: "movie", query: "", genreId: null, genreMedia: null, country: null, personalized: true };
  it("keeps page 1 URLs identical to the pre-paging ones", () => {
    expect(discoverEndpoint(base, 1)).toBe("/api/movies/recommended");
    expect(discoverEndpoint({ ...base, personalized: false }, 1)).toBe("/api/movies/contextual");
    expect(discoverEndpoint({ ...base, mediaType: "tv" }, 1)).toBe("/api/tv/recommended");
    expect(discoverEndpoint({ ...base, country: "KR" }, 1)).toBe("/api/discover/movie?country=KR");
    expect(discoverEndpoint({ ...base, query: "a b" }, 1)).toBe("/api/movies/search?q=a%20b");
  });
  it("adds the page for later pages in each mode", () => {
    expect(discoverEndpoint(base, 2)).toBe("/api/movies/recommended?page=2");
    expect(discoverEndpoint({ ...base, personalized: false }, 3)).toBe("/api/movies/contextual?page=3");
    expect(discoverEndpoint({ ...base, personalized: false, localHour: 21 }, 3)).toBe("/api/movies/contextual?hour=21&page=3");
    expect(discoverEndpoint({ ...base, mediaType: "tv" }, 2)).toBe("/api/tv/recommended?page=2");
    expect(discoverEndpoint({ ...base, mediaType: "tv", query: "x" }, 2)).toBe("/api/tv/search?q=x&page=2");
    expect(discoverEndpoint({ ...base, country: "JP", mediaType: "tv" }, 2)).toBe("/api/discover/tv?country=JP&page=2");
  });
  it("genre mode follows genreMedia and keeps the country filter", () => {
    expect(discoverEndpoint({ ...base, genreId: "18", genreMedia: "tv", country: "FR" }, 2)).toBe(
      "/api/discover/tv?genreId=18&country=FR&page=2"
    );
    expect(discoverEndpoint({ ...base, genreId: "18" }, 1)).toBe("/api/discover/movie?genreId=18");
  });
});
