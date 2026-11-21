import { describe, expect, it, vi } from "vitest";
import { buildFallbackQueries, fuzzySearch, titleSimilarity, wordCorrections } from "./fuzzySearch";

// fuzzySearch takes the search function as a parameter, so tests pass a fake
// instead of calling TMDB — no network, no API key, deterministic results.
type Item = { id: number; popularity: number; title: string };
const getTitle = (i: Item) => i.title;

function fakeSearch(byQuery: Record<string, Item[]>) {
  return vi.fn(async (q: string) => ({ results: byQuery[q] ?? [] }));
}

describe("wordCorrections", () => {
  it("fixes a single typo", () => {
    expect(wordCorrections("loghtning")).toEqual(["lightning"]);
    expect(wordCorrections("godfathr")).toEqual(["godfather"]);
  });

  it("counts swapped adjacent letters as one typo", () => {
    expect(wordCorrections("teh")[0]).toBe("the");
  });

  it("returns runner-up fixes, most common first", () => {
    expect(wordCorrections("strnger")).toEqual(["stronger", "stranger", "stringer"]);
  });

  it("respects the max argument", () => {
    expect(wordCorrections("strnger", 1)).toEqual(["stronger"]);
  });

  it("leaves real words, short words, and words with digits alone", () => {
    expect(wordCorrections("the")).toEqual(["the"]);
    expect(wordCorrections("ab")).toEqual(["ab"]);
    expect(wordCorrections("r2d2")).toEqual(["r2d2"]);
  });

  it("returns the word unchanged when no fix is found", () => {
    expect(wordCorrections("incepshun")).toEqual(["incepshun"]);
  });
});

describe("titleSimilarity", () => {
  it("is 1 for an exact match, ignoring case and accents", () => {
    expect(titleSimilarity("matrix", "Matrix")).toBe(1);
    expect(titleSimilarity("amelie", "Amélie")).toBe(1);
  });

  it("ignores a leading article in the title", () => {
    expect(titleSimilarity("matrix", "The Matrix")).toBe(1);
  });

  it("matches a misspelled prefix of a longer title", () => {
    expect(titleSimilarity("godfathr", "The Godfather Part II")).toBeGreaterThan(0.8);
  });

  it("tolerates punctuation differences", () => {
    expect(titleSimilarity("dont look up", "Don't Look Up")).toBeGreaterThan(0.9);
  });

  it("is low for unrelated titles", () => {
    expect(titleSimilarity("godfather", "Finding Nemo")).toBeLessThan(0.5);
  });

  it("is 0 when either side has no letters or digits", () => {
    expect(titleSimilarity("", "Anything")).toBe(0);
    expect(titleSimilarity("x", "!!!")).toBe(0);
  });
});

describe("buildFallbackQueries", () => {
  it("puts the spell-corrected query first", () => {
    expect(buildFallbackQueries("loghtning thief")[0]).toBe("lightning thief");
  });

  it("includes truncated and dropped-word variants", () => {
    const qs = buildFallbackQueries("loghtning thief");
    expect(qs).toContain("log thi");
    expect(qs).toContain("thief");
    expect(qs).toContain("loghtning");
  });

  it("never repeats the original query or returns a bare stopword", () => {
    const qs = buildFallbackQueries("The Godfathr");
    expect(qs).not.toContain("the godfathr");
    expect(qs).not.toContain("the");
    expect(new Set(qs).size).toBe(qs.length);
  });

  it("caps the number of queries (each one is a TMDB request)", () => {
    expect(buildFallbackQueries("strnger things in the upsde down").length).toBeLessThanOrEqual(6);
  });

  it("returns nothing for empty or stopword-only input", () => {
    expect(buildFallbackQueries("")).toEqual([]);
    expect(buildFallbackQueries("   ")).toEqual([]);
    expect(buildFallbackQueries("the")).toEqual([]);
  });
});

describe("fuzzySearch", () => {
  it("finds titles via the corrected query and suggests the corrected words", async () => {
    const search = fakeSearch({
      lightning: [
        { id: 1, popularity: 5, title: "The Lightning Thief" },
        { id: 2, popularity: 1, title: "Lightning Point" },
        { id: 3, popularity: 9, title: "Totally Unrelated" },
      ],
    });
    const { results, suggestion } = await fuzzySearch("loghtning", search, getTitle);
    expect(results.map((r) => r.id)).toEqual([1, 2]); // unrelated title filtered out
    expect(suggestion).toBe("Lightning");
    expect(search).toHaveBeenCalledWith("lightning");
  });

  it("suggests the full title when the query misspelled all of it", async () => {
    const search = fakeSearch({
      "the godfather": [{ id: 1, popularity: 1, title: "The Godfather" }],
    });
    const { suggestion } = await fuzzySearch("the godfathr", search, getTitle);
    expect(suggestion).toBe("The Godfather");
  });

  // Regression: suggestionFor stripped the leading "the" from the title but
  // not from the corrected query, so "the loghtning" suggested the whole title
  // "The Lightning Thief" while "loghtning" suggested just "Lightning".
  it("suggests only the corrected words when the query starts with an article", async () => {
    const search = fakeSearch({
      "the lightning": [{ id: 1, popularity: 1, title: "The Lightning Thief" }],
    });
    const { suggestion } = await fuzzySearch("the loghtning", search, getTitle);
    expect(suggestion).toBe("The Lightning");
  });

  it("ranks closer titles first and breaks ties by popularity", async () => {
    const search = fakeSearch({
      godfather: [
        { id: 1, popularity: 10, title: "The Godfather Part III" },
        { id: 2, popularity: 50, title: "The Godfather" },
        { id: 3, popularity: 99, title: "Godfather" },
      ],
    });
    const { results } = await fuzzySearch("godfathr", search, getTitle);
    // "The Godfather" and "Godfather" both score 1 after article stripping, so
    // popularity decides; the Part III prefix match scores a little lower.
    expect(results.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("de-duplicates items returned by several fallback queries", async () => {
    const item = { id: 7, popularity: 1, title: "Stranger Things" };
    const search = vi.fn(async () => ({ results: [item] }));
    const { results } = await fuzzySearch("strnger things", search, getTitle);
    expect(results).toEqual([item]);
    expect(search.mock.calls.length).toBeGreaterThan(1);
  });

  it("ignores failed searches instead of throwing", async () => {
    const search = vi.fn(async (q: string) => {
      if (q === "stranger things") return { results: [{ id: 1, popularity: 1, title: "Stranger Things" }] };
      throw new Error("TMDB down");
    });
    const { results } = await fuzzySearch("strnger things", search, getTitle);
    expect(results.map((r) => r.id)).toEqual([1]);
  });

  it("returns no results and no suggestion when nothing matches", async () => {
    const { results, suggestion } = await fuzzySearch("zzzzqx", fakeSearch({}), getTitle);
    expect(results).toEqual([]);
    expect(suggestion).toBeNull();
  });
});
