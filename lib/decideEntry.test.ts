import { describe, expect, it } from "vitest";
import { DEFAULT_SELECTION } from "./moodPicker";
import { bannerCopy, decideHref, nextTabIndex, parseActiveSession, startDecideRequest, startErrorMessage } from "./decideEntry";

describe("startDecideRequest", () => {
  it("sends the partner and exactly four moods", () => {
    const body = startDecideRequest("p1", { ...DEFAULT_SELECTION, vibe: "light", fresh: true });
    expect(body).toEqual({ partnerId: "p1", mood: { vibe: "light", time: "any", fresh: true, onMyServices: false } });
  });
});

describe("startErrorMessage", () => {
  it("maps the API statuses to the spec copy", () => {
    expect(startErrorMessage(422)).toBe("Not enough for a vote. Try a different mood.");
    expect(startErrorMessage(500)).toBe("Couldn't start. Try again.");
    expect(startErrorMessage(0)).toBe("Couldn't start. Try again.");
  });
});

describe("parseActiveSession", () => {
  it("reads a session", () => {
    expect(parseActiveSession({ session: { id: "s1", createdBy: "partner", createdAt: "x" } })).toEqual({ id: "s1", createdBy: "partner" });
  });
  it.each([null, {}, { session: null }, { session: { id: "", createdBy: "me" } }, { session: { id: "s", createdBy: "x" } }, "str"])(
    "treats %j as no session",
    (body) => expect(parseActiveSession(body)).toBeNull(),
  );
});

describe("bannerCopy", () => {
  it("offers Join for the friend's session and Resume for mine, by first name, never an email", () => {
    expect(bannerCopy({ id: "s", createdBy: "partner" }, "Sam Jones")).toEqual({ text: "Sam started a vote", action: "Join" });
    expect(bannerCopy({ id: "s", createdBy: "me" }, null)).toEqual({ text: "Your vote with your friend is open", action: "Resume" });
  });
});

describe("decideHref", () => {
  it("links to the vote screen", () => expect(decideHref("abc")).toBe("/decide/abc"));
});

describe("nextTabIndex", () => {
  it("wraps forwards and backwards", () => {
    expect(nextTabIndex(3, 2, false)).toBe(0);
    expect(nextTabIndex(3, 0, true)).toBe(2);
    expect(nextTabIndex(3, 0, false)).toBe(1);
    expect(nextTabIndex(3, 2, true)).toBe(1);
  });
  it("enters the list when focus is outside it", () => {
    expect(nextTabIndex(3, -1, false)).toBe(0);
    expect(nextTabIndex(3, -1, true)).toBe(2);
  });
  it("returns -1 when nothing is focusable", () => {
    expect(nextTabIndex(0, -1, false)).toBe(-1);
  });
});
