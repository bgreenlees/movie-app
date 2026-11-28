import { describe, expect, it } from "vitest";
import { parseFriends, resolveWith } from "./watchWith";

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
