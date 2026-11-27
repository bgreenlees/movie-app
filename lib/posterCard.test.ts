import { describe, expect, it } from "vitest";
import { detailHref, episodeMeta, isOnList, seasonMeta, seasonProgress, statusChip, yearMeta } from "./posterCard";

describe("yearMeta", () => {
  it("joins year and type", () => {
    expect(yearMeta("2024-05-01", "movie")).toBe("2024 · Movie");
    expect(yearMeta("2011-12-04", "tv")).toBe("2011 · TV");
  });
  it("falls back to the type without a date", () => {
    expect(yearMeta(null, "movie")).toBe("Movie");
    expect(yearMeta("", "tv")).toBe("TV");
    expect(yearMeta("unknown", "tv")).toBe("TV");
  });
});

describe("episodeMeta", () => {
  it("formats season and episode", () => {
    expect(episodeMeta(2, 3)).toBe("S2 · E3");
    expect(episodeMeta(4, null)).toBe("S4");
    expect(episodeMeta(null, 5)).toBe("E5");
    expect(episodeMeta(null, null)).toBeNull();
  });
});

describe("seasonMeta", () => {
  const b = (premiereDate: string | null, lastAirDate: string | null, status = "Ended") => ({
    number: 3,
    premiereDate,
    lastAirDate,
    status,
  });
  it("shows 'now' for a returning series", () => {
    expect(seasonMeta(b("2025-03-07", "2025-04-01", "Returning Series"))).toBe("S3 · Mar 2025 – now");
    expect(seasonMeta(b("2025-03-07", null, "In Production"))).toBe("S3 · Mar 2025 – now");
  });
  it("collapses the year when the season starts and ends in the same year", () => {
    expect(seasonMeta(b("2024-01-10", "2024-03-02"))).toBe("S3 · Jan – Mar 2024");
    expect(seasonMeta(b("2024-01-10", "2024-01-31"))).toBe("S3 · Jan 2024");
  });
  it("spans years", () => {
    expect(seasonMeta(b("2023-11-01", "2024-02-14"))).toBe("S3 · Nov 2023 – Feb 2024");
  });
  it("copes with missing dates", () => {
    expect(seasonMeta(b(null, null))).toBe("S3");
    expect(seasonMeta(b("2024-06-01", null))).toBe("S3 · Jun 2024");
  });
  it("doesn't shift with the time zone (parses the string, not a Date)", () => {
    expect(seasonMeta(b("2024-01-01", "2024-12-31"))).toBe("S3 · Jan – Dec 2024");
  });
});

describe("statusChip", () => {
  it("maps list statuses to short labels", () => {
    expect(statusChip("WATCHING")).toBe("Watching");
    expect(statusChip("WANT_TO_WATCH")).toBe("Want");
    expect(statusChip("WATCHED")).toBe("Seen");
  });
  it("adds the user's rating on watched titles", () => {
    expect(statusChip("WATCHED", 3)).toBe("Seen ♥");
    expect(statusChip("WATCHED", 2)).toBe("Seen 👍");
    expect(statusChip("WATCHED", 1)).toBe("Seen 👎");
    expect(statusChip("WATCHED", 0)).toBe("Seen");
  });
  it("shows no chip otherwise", () => {
    expect(statusChip(null)).toBeNull();
    expect(statusChip("NOT_INTERESTED")).toBeNull();
  });
});

describe("isOnList", () => {
  it("is true for real list statuses only", () => {
    expect(isOnList("WATCHING")).toBe(true);
    expect(isOnList("WANT_TO_WATCH")).toBe(true);
    expect(isOnList("WATCHED")).toBe(true);
    expect(isOnList("NOT_INTERESTED")).toBe(false);
    expect(isOnList(undefined)).toBe(false);
  });
});

describe("seasonProgress", () => {
  it("is the share of the season reached", () => {
    expect(seasonProgress(3, 10)).toBeCloseTo(0.3);
    expect(seasonProgress(10, 10)).toBe(1);
  });
  it("clamps past the end", () => {
    expect(seasonProgress(12, 10)).toBe(1);
  });
  it("is null when unknown", () => {
    expect(seasonProgress(null, 10)).toBeNull();
    expect(seasonProgress(3, null)).toBeNull();
    expect(seasonProgress(3, 0)).toBeNull();
  });
});

describe("detailHref", () => {
  it("links to the movie or TV detail page", () => {
    expect(detailHref("movie", 693134)).toBe("/movie/693134");
    expect(detailHref("tv", 1399)).toBe("/tv/1399");
  });
});
