import { describe, expect, it } from "vitest";
import { getBackdropUrl, getPosterUrl } from "./tmdbImages";

describe("tmdbImages", () => {
  it("builds poster URLs, defaulting to w500", () => {
    expect(getPosterUrl("/a.jpg")).toBe("https://image.tmdb.org/t/p/w500/a.jpg");
    expect(getPosterUrl("/a.jpg", "original")).toBe("https://image.tmdb.org/t/p/original/a.jpg");
  });

  it("builds backdrop URLs, defaulting to w1280", () => {
    expect(getBackdropUrl("/b.jpg")).toBe("https://image.tmdb.org/t/p/w1280/b.jpg");
    expect(getBackdropUrl("/b.jpg", "w780")).toBe("https://image.tmdb.org/t/p/w780/b.jpg");
  });

  it("returns null for a missing path", () => {
    expect(getPosterUrl(null)).toBeNull();
    expect(getBackdropUrl(null)).toBeNull();
  });
});
