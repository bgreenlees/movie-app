import { describe, expect, it } from "vitest";
import {
  cardMeta,
  isRetryableStatus,
  loginHrefFor,
  firstUnvotedIndex,
  nextUnvotedIndex,
  partnerLabel,
  pollInterval,
  screenFor,
  voteForKey,
  voteForSwipe,
  votedCount,
  type DecideCandidateView,
} from "./decideView";

const card = (id: string): DecideCandidateView => ({
  id,
  mediaType: "movie",
  tmdbId: 1,
  title: id,
  posterPath: null,
  date: "2024-01-01",
  runtime: null,
  providerIds: [],
  reason: "",
});
const cards = [card("a"), card("b"), card("c")];

describe("screenFor", () => {
  it("votes while I have cards left", () => {
    expect(screenFor({ status: "OPEN", candidates: cards, myVotes: { a: 1 } })).toBe("vote");
  });
  it("waits once I've voted on every card", () => {
    expect(screenFor({ status: "OPEN", candidates: cards, myVotes: { a: 0, b: 1, c: 2 } })).toBe("wait");
  });
  it("never waits on an empty round", () => {
    expect(screenFor({ status: "OPEN", candidates: [], myVotes: {} })).toBe("vote");
  });
  it("reveals a match or a pick", () => {
    const result = { winner: card("a"), alsoMatched: [], bothReallyWant: false, picked: false };
    expect(screenFor({ status: "MATCHED", candidates: cards, myVotes: {}, result })).toBe("reveal");
    expect(screenFor({ status: "PICKED", candidates: cards, myVotes: {}, result })).toBe("reveal");
  });
  it("treats a resolved session without a result as ended", () => {
    expect(screenFor({ status: "MATCHED", candidates: cards, myVotes: {} })).toBe("ended");
  });
  it("shows no match, and ended for cancelled or expired", () => {
    expect(screenFor({ status: "NO_MATCH", candidates: cards, myVotes: {} })).toBe("no-match");
    expect(screenFor({ status: "CANCELLED", candidates: cards, myVotes: {} })).toBe("ended");
    expect(screenFor({ status: "EXPIRED", candidates: cards, myVotes: {} })).toBe("ended");
  });
});

describe("votes", () => {
  it("counts only this round's valid votes", () => {
    expect(votedCount(cards, { a: 0, z: 1, b: 9 as never })).toBe(1);
  });
  it("resumes at the first unvoted card", () => {
    expect(firstUnvotedIndex(cards, { a: 1, c: 0 })).toBe(1);
    expect(firstUnvotedIndex(cards, { a: 1, b: 1, c: 0 })).toBe(3);
  });
  it("moves on to the next unvoted card, wrapping back after an undo", () => {
    expect(nextUnvotedIndex(cards, { a: 1 }, 0)).toBe(1);
    expect(nextUnvotedIndex(cards, { a: 1, b: 1 }, 0)).toBe(2); // b was already voted, skip it
    expect(nextUnvotedIndex(cards, { b: 1, c: 1 }, 2)).toBe(0);
    expect(nextUnvotedIndex(cards, { a: 1, b: 1, c: 1 }, 1)).toBe(3);
  });
});

describe("input", () => {
  it("maps arrow keys", () => {
    expect(voteForKey("ArrowLeft")).toBe(0);
    expect(voteForKey("ArrowRight")).toBe(1);
    expect(voteForKey("ArrowUp")).toBe(2);
    expect(voteForKey("ArrowDown")).toBeNull();
    expect(voteForKey("a")).toBeNull();
  });
  it("maps clear swipes and ignores short or diagonal ones", () => {
    expect(voteForSwipe(-120, 10)).toBe(0);
    expect(voteForSwipe(120, -10)).toBe(1);
    expect(voteForSwipe(5, -120)).toBe(2);
    expect(voteForSwipe(40, 0)).toBeNull();
    expect(voteForSwipe(100, 100)).toBeNull();
    expect(voteForSwipe(0, 150)).toBeNull(); // a downward scroll never votes
  });
});

describe("pollInterval", () => {
  it("polls every 3 s while waiting and stops on final screens", () => {
    expect(pollInterval("wait")).toBe(3000);
    expect(pollInterval("no-match")).toBe(3000);
    expect(pollInterval("vote")).toBeGreaterThan(3000);
    expect(pollInterval("reveal")).toBeNull();
    expect(pollInterval("ended")).toBeNull();
  });
});

describe("copy", () => {
  it("formats card meta", () => {
    expect(cardMeta({ date: "2024-05-01", mediaType: "movie", runtime: 112 })).toBe("2024 · Movie · 1 h 52 m");
    expect(cardMeta({ date: "", mediaType: "tv", runtime: 45 })).toBe("TV · 45 m");
    expect(cardMeta({ date: "2020", mediaType: "movie", runtime: 120 })).toBe("2020 · Movie · 2 h");
  });
  it("uses a first name, with a fallback", () => {
    expect(partnerLabel("Sam Jones")).toBe("Sam");
    expect(partnerLabel("  ")).toBe("your friend");
    expect(partnerLabel(null)).toBe("your friend");
  });
});

describe("isRetryableStatus", () => {
  it("retries network errors and 5xx only", () => {
    expect(isRetryableStatus(0)).toBe(true);
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    for (const s of [400, 401, 403, 404, 409, 429]) expect(isRetryableStatus(s)).toBe(false);
  });
});

describe("loginHrefFor", () => {
  it("encodes the return path", () => {
    expect(loginHrefFor("/decide/abc")).toBe("/login?callbackUrl=%2Fdecide%2Fabc");
  });
});
