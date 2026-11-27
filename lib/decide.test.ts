import { describe, expect, it } from "vitest";
import {
  decideMoodSchema,
  decideQuerySchema,
  isRoundComplete,
  pickForUs,
  resolveRound,
  splitIntoRounds,
  startDecideBodySchema,
  voteBodySchema,
  type Votes,
} from "./decide";

const c = (id: string, score = 0.5, mediaType: "movie" | "tv" = "movie") => ({ id, score, mediaType });

describe("splitIntoRounds", () => {
  const ranked = Array.from({ length: 30 }, (_, i) => i);

  it("cuts 30 ranked titles into 3 rounds of 10, best first", () => {
    const rounds = splitIntoRounds(ranked, 10, 3);
    expect(rounds).toHaveLength(3);
    expect(rounds[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(rounds[2][9]).toBe(29);
  });

  it("leaves the last round short and drops empty rounds", () => {
    expect(splitIntoRounds(ranked.slice(0, 25), 10, 3).map((r) => r.length)).toEqual([10, 10, 5]);
    expect(splitIntoRounds(ranked.slice(0, 7), 10, 3).map((r) => r.length)).toEqual([7]);
    expect(splitIntoRounds([], 10, 3)).toEqual([]);
  });

  it("drops anything past size × rounds", () => {
    expect(splitIntoRounds(Array.from({ length: 50 }, (_, i) => i), 10, 3).flat()).toHaveLength(30);
  });

  it("rejects a non-positive size", () => {
    expect(() => splitIntoRounds(ranked, 0, 3)).toThrow(RangeError);
  });
});

describe("isRoundComplete", () => {
  const round = [c("a"), c("b"), c("c")];

  it("is false while either person has cards left", () => {
    const done: Votes = { a: 1, b: 0, c: 2 };
    expect(isRoundComplete(round, done, { a: 1, b: 1 })).toBe(false);
    expect(isRoundComplete(round, { a: 1 }, done)).toBe(false);
    expect(isRoundComplete(round, {}, {})).toBe(false);
  });

  it("is true once both have voted on every card (No counts as a vote)", () => {
    expect(isRoundComplete(round, { a: 0, b: 0, c: 0 }, { a: 2, b: 1, c: 0 })).toBe(true);
  });

  it("ignores votes on cards from other rounds", () => {
    expect(isRoundComplete(round, { a: 1, b: 1, x: 1 }, { a: 1, b: 1, c: 1, x: 1 })).toBe(false);
  });

  it("never treats an empty round as complete", () => {
    expect(isRoundComplete([], {}, {})).toBe(false);
  });
});

describe("resolveRound", () => {
  it("finds a single match", () => {
    const round = [c("a"), c("b"), c("c")];
    const result = resolveRound(round, { a: 1, b: 0, c: 2 }, { a: 0, b: 1, c: 1 });
    expect(result).toEqual({ matched: true, winner: round[2], alsoMatched: [], bothReallyWant: false });
  });

  it("ranks by vote sum first", () => {
    const round = [c("a", 0.9), c("b", 0.1)];
    // a: Yes + Yes = 2; b: Really want + Yes = 3
    const result = resolveRound(round, { a: 1, b: 2 }, { a: 1, b: 1 });
    expect(result.matched && result.winner.id).toBe("b");
    expect(result.matched && result.alsoMatched.map((m) => m.id)).toEqual(["a"]);
  });

  it("ranks Really-wants above pair score", () => {
    // "rw" has a Really-want (2 + 1 = 3) and a low score; "yy" is Yes + Yes (2)
    // with a high score. Really-want wins.
    const round = [c("yy", 0.99), c("rw", 0.1)];
    const result = resolveRound(round, { yy: 1, rw: 2 }, { yy: 1, rw: 1 });
    expect(result.matched && result.winner.id).toBe("rw");
    expect(result.matched && result.bothReallyWant).toBe(false);
  });

  it("breaks a tie on sum and Really-wants by pair score", () => {
    // Both are Really want + Yes (sum 3, one Really-want each): score decides,
    // whichever person gave the Really-want.
    const round = [c("yy", 0.99), c("rwLow", 0.2), c("rwHigh", 0.8)];
    const result = resolveRound(round, { yy: 1, rwLow: 2, rwHigh: 1 }, { yy: 1, rwLow: 1, rwHigh: 2 });
    expect(result.matched && result.winner.id).toBe("rwHigh");
    expect(result.matched && result.alsoMatched.map((m) => m.id)).toEqual(["rwLow", "yy"]);
  });

  it("sets bothReallyWant when both chose Really want on the winner", () => {
    const round = [c("both", 0.1), c("one", 0.9)];
    const result = resolveRound(round, { both: 2, one: 2 }, { both: 2, one: 1 });
    expect(result.matched && result.winner.id).toBe("both");
    expect(result.matched && result.bothReallyWant).toBe(true);
  });

  it("falls back to round order when sum, Really-wants and score all tie", () => {
    const round = [c("first", 0.5), c("second", 0.5)];
    const result = resolveRound(round, { first: 1, second: 1 }, { first: 1, second: 1 });
    expect(result.matched && result.winner.id).toBe("first");
  });

  it("shows at most 2 runners-up", () => {
    const round = ["a", "b", "c", "d"].map((id) => c(id));
    const all: Votes = { a: 1, b: 1, c: 1, d: 1 };
    const result = resolveRound(round, all, all);
    expect(result.matched && result.alsoMatched).toHaveLength(2);
  });

  it("returns no match when every title got a No from someone", () => {
    const round = [c("a"), c("b"), c("c")];
    expect(resolveRound(round, { a: 2, b: 0, c: 1 }, { a: 0, b: 2, c: 0 })).toEqual({ matched: false });
  });

  it("does not count a missing vote as a match", () => {
    const round = [c("a"), c("b")];
    expect(resolveRound(round, { a: 2, b: 2 }, { a: 2 })).toMatchObject({ winner: round[0] });
    expect(resolveRound(round, { a: 2 }, {})).toEqual({ matched: false });
  });

  it("ignores media type: an all-TV round resolves like any other", () => {
    const round = [c("m", 0.5, "movie"), c("t", 0.6, "tv")];
    const result = resolveRound(round, { m: 1, t: 1 }, { m: 1, t: 1 });
    expect(result.matched && result.winner.id).toBe("t");
  });
});

describe("pickForUs", () => {
  const held = [c("top", 0.9), c("mid", 0.7), c("low", 0.3)];

  it("picks the highest score when nobody voted No", () => {
    expect(pickForUs(held, [])?.id).toBe("top");
  });

  it("skips titles either person voted No on", () => {
    const votes = [
      { candidateId: "top", vote: 2 },
      { candidateId: "top", vote: 0 }, // partner's No
      { candidateId: "mid", vote: 0 },
      { candidateId: "low", vote: 1 },
    ];
    expect(pickForUs(held, votes)?.id).toBe("low");
  });

  it("falls back to the highest score overall when everything got a No", () => {
    const votes = held.map((h) => ({ candidateId: h.id, vote: 0 }));
    expect(pickForUs(held, votes)?.id).toBe("top");
  });

  it("returns null with no candidates", () => {
    expect(pickForUs([], [])).toBeNull();
  });
});

describe("request schemas", () => {
  const id = "cmabc123def456ghi789jkl0";

  it("accepts each valid vote value", () => {
    for (const vote of [0, 1, 2]) {
      expect(voteBodySchema.safeParse({ candidateId: id, vote }).success).toBe(true);
    }
  });

  it.each([3, -1, 1.5, "1", null, true, Number.NaN])("rejects vote %s", (vote) => {
    expect(voteBodySchema.safeParse({ candidateId: id, vote }).success).toBe(false);
  });

  it("rejects a missing or malformed candidateId", () => {
    expect(voteBodySchema.safeParse({ vote: 1 }).success).toBe(false);
    expect(voteBodySchema.safeParse({ candidateId: "", vote: 1 }).success).toBe(false);
    expect(voteBodySchema.safeParse({ candidateId: "a".repeat(41), vote: 1 }).success).toBe(false);
    expect(voteBodySchema.safeParse({ candidateId: "x'; drop", vote: 1 }).success).toBe(false);
  });

  it("strips unknown keys, so a client can't pass its own userId", () => {
    const parsed = voteBodySchema.parse({ candidateId: id, vote: 2, userId: "someone-else" });
    expect(parsed).toEqual({ candidateId: id, vote: 2 });
  });

  it("parses a start body and forces media to both", () => {
    const parsed = startDecideBodySchema.parse({
      partnerId: id,
      mood: { vibe: "light", time: "30", fresh: true, onMyServices: false, media: "movie" },
      sharedOnly: true,
    });
    expect(parsed).toEqual({
      partnerId: id,
      mood: { vibe: "light", time: "30", fresh: true, onMyServices: false, media: "both" },
      sharedOnly: true,
    });
  });

  it("rejects an unknown mood value", () => {
    expect(
      decideMoodSchema.safeParse({ vibe: "spooky", time: "any", fresh: false, onMyServices: false }).success,
    ).toBe(false);
  });

  it("validates the partnerId query", () => {
    expect(decideQuerySchema.safeParse({ partnerId: id }).success).toBe(true);
    expect(decideQuerySchema.safeParse({}).success).toBe(false);
  });
});
