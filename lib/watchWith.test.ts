import { describe, expect, it } from "vitest";
import { parseFriends, resolveWith, withMode, type FriendsState } from "./watchWith";

const body = {
  friends: [
    { connectionId: "c1", friend: { id: "u2", name: "Sam", email: "sam@example.test" } },
    { connectionId: "c2", friend: { id: "u1", name: null, email: "x@example.test" } },
    { connectionId: "c3", friend: { id: "u2", name: "Dupe" } },
    { connectionId: "c4", friend: null },
    { connectionId: "c5", friend: { id: 7, name: "Bad" } },
  ],
  pending: [],
};

describe("parseFriends", () => {
  it("keeps id and name only, names a nameless friend, drops junk and duplicates", () => {
    expect(parseFriends(body)).toEqual([
      { id: "u1", name: "Friend" },
      { id: "u2", name: "Sam" },
    ]);
  });

  it("never carries an email", () => {
    expect(JSON.stringify(parseFriends(body))).not.toMatch(/example\.test/);
  });

  it("returns [] for a malformed response", () => {
    for (const b of [null, undefined, "x", {}, { friends: "no" }]) expect(parseFriends(b)).toEqual([]);
  });
});

describe("resolveWith", () => {
  const friends = parseFriends(body);

  it("finds an accepted friend", () => {
    expect(resolveWith("u2", friends)).toEqual({ id: "u2", name: "Sam" });
  });

  it("falls back to null for missing, unknown and malformed ids alike", () => {
    for (const raw of [null, undefined, "", "stranger", "../../x", "u2 "]) expect(resolveWith(raw, friends)).toBeNull();
  });

  it("is null when there are no friends", () => {
    expect(resolveWith("u2", [])).toBeNull();
  });
});

describe("withMode", () => {
  const ready: FriendsState = { status: "ready", friends: parseFriends(body) };

  it("waits for the list when a link names a friend, otherwise is solo", () => {
    expect(withMode("u2", { status: "loading" })).toEqual({ kind: "resolving" });
    expect(withMode(null, { status: "loading" })).toEqual({ kind: "solo" });
  });

  it("on a failed load keeps the link and never falls back", () => {
    expect(withMode("u2", { status: "error" })).toEqual({ kind: "error", hasWith: true });
    expect(withMode(null, { status: "error" })).toEqual({ kind: "error", hasWith: false });
  });

  it("is pair for an accepted friend, stale for anyone else, solo with no link", () => {
    expect(withMode("u2", ready)).toEqual({ kind: "pair", friend: { id: "u2", name: "Sam" } });
    expect(withMode("stranger", ready)).toEqual({ kind: "stale" });
    expect(withMode(null, ready)).toEqual({ kind: "solo" });
    expect(withMode("u2", { status: "ready", friends: [] })).toEqual({ kind: "stale" });
  });
});
