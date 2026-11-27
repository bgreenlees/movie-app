import { describe, expect, it } from "vitest";
import {
  firstError,
  parseEnum,
  parseId,
  parsePlatform,
  parseProgress,
  parseRating,
  parseReview,
  parseStreamingServices,
  parseWatchType,
  readJsonObject,
} from "./validation";

describe("parseId", () => {
  it("accepts positive integers", () => expect(parseId(550, "movieId")).toEqual({ ok: true, value: 550 }));
  it.each([0, -1, 1.5, "abc", "5", null, undefined, NaN, Infinity, 2 ** 60])("rejects %s", (v) => {
    const r = parseId(v, "movieId");
    expect(r).toEqual({ ok: false, error: "movieId must be a positive integer" });
  });
});

describe("parseRating", () => {
  it.each([1, 3, 5])("accepts %s", (v) => expect(parseRating(v)).toEqual({ ok: true, value: v }));
  it("treats null/undefined as cleared", () => {
    expect(parseRating(null)).toEqual({ ok: true, value: null });
    expect(parseRating(undefined)).toEqual({ ok: true, value: null });
  });
  it.each([0, 6, 999, -1, 2.5, "3", NaN])("rejects %s", (v) => expect(parseRating(v).ok).toBe(false));
  it("names the field", () => {
    expect(parseRating(999)).toMatchObject({ error: expect.stringContaining("rating") });
  });
});

describe("parseReview", () => {
  it("accepts up to 2000 chars", () => expect(parseReview("a".repeat(2000)).ok).toBe(true));
  it("rejects 2001 chars and a 1 MB review", () => {
    expect(parseReview("a".repeat(2001)).ok).toBe(false);
    expect(parseReview("a".repeat(1_000_000)).ok).toBe(false);
  });
  it("maps empty/null to null", () => {
    expect(parseReview("")).toEqual({ ok: true, value: null });
    expect(parseReview(null)).toEqual({ ok: true, value: null });
  });
  it("rejects non-strings", () => expect(parseReview(5).ok).toBe(false));
});

describe("parsePlatform / parseWatchType", () => {
  it("accept up to 50 chars", () => {
    expect(parsePlatform("a".repeat(50)).ok).toBe(true);
    expect(parseWatchType("Cinema").ok).toBe(true);
  });
  it("reject 51 chars and non-strings, naming the field", () => {
    expect(parsePlatform("a".repeat(51))).toMatchObject({ ok: false, error: expect.stringContaining("platform") });
    expect(parseWatchType("a".repeat(51))).toMatchObject({ ok: false, error: expect.stringContaining("watchType") });
    expect(parsePlatform({}).ok).toBe(false);
  });
  it("map empty to null", () => expect(parsePlatform("")).toEqual({ ok: true, value: null }));
});

describe("parseProgress", () => {
  it.each([0, 1, 500])("accepts %s", (v) => expect(parseProgress(v, "currentSeason")).toEqual({ ok: true, value: v }));
  it("treats null/undefined as cleared", () => expect(parseProgress(null, "currentEpisode")).toEqual({ ok: true, value: null }));
  it.each([-1, 501, 1.5, "2", NaN])("rejects %s", (v) => {
    expect(parseProgress(v, "currentEpisode")).toMatchObject({ ok: false, error: expect.stringContaining("currentEpisode") });
  });
});

describe("parseEnum", () => {
  const allowed = ["A", "B"] as const;
  it("accepts members", () => expect(parseEnum("A", allowed, "status")).toEqual({ ok: true, value: "A" }));
  it.each(["C", "", 1, null, undefined])("rejects %s", (v) => expect(parseEnum(v, allowed, "status").ok).toBe(false));
});

describe("parseStreamingServices", () => {
  it("accepts an empty array and 50 ids", () => {
    expect(parseStreamingServices([]).ok).toBe(true);
    expect(parseStreamingServices(Array.from({ length: 50 }, (_, i) => i + 1)).ok).toBe(true);
  });
  it("rejects 51 items and a 20,000-item array", () => {
    expect(parseStreamingServices(Array(51).fill(8)).ok).toBe(false);
    expect(parseStreamingServices(Array(20000).fill(8)).ok).toBe(false);
  });
  it("rejects non-arrays and bad elements", () => {
    expect(parseStreamingServices("8").ok).toBe(false);
    expect(parseStreamingServices([8, "9"]).ok).toBe(false);
    expect(parseStreamingServices([0]).ok).toBe(false);
    expect(parseStreamingServices([-3]).ok).toBe(false);
    expect(parseStreamingServices([1.5]).ok).toBe(false);
  });
});

describe("firstError", () => {
  it("returns null when all pass, else the first error", () => {
    expect(firstError(parseRating(3), parseReview("hi"))).toBeNull();
    expect(firstError(parseRating(3), parseRating(9), parseReview("a".repeat(3000)))).toContain("rating");
  });
});

describe("readJsonObject", () => {
  const req = (body: string) => new Request("http://x", { method: "POST", body });
  it("parses objects", async () => expect(await readJsonObject(req('{"a":1}'))).toEqual({ ok: true, value: { a: 1 } }));
  it("rejects invalid JSON, arrays, null and scalars", async () => {
    for (const b of ["{", "[1]", "null", "5"]) expect((await readJsonObject(req(b))).ok).toBe(false);
  });
});
