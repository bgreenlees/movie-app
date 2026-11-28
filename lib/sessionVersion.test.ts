import { describe, expect, it } from "vitest";
import { SESSION_RECHECK_MS, isSessionCurrent, needsRecheck } from "./sessionVersion";

const NOW = 1_800_000_000_000;

describe("needsRecheck", () => {
  it("skips the database within the window", () => {
    expect(needsRecheck(NOW, NOW)).toBe(false);
    expect(needsRecheck(NOW - SESSION_RECHECK_MS + 1, NOW)).toBe(false);
  });

  it("re-checks once the window has passed", () => {
    expect(needsRecheck(NOW - SESSION_RECHECK_MS, NOW)).toBe(true);
    expect(needsRecheck(NOW - 60 * 60 * 1000, NOW)).toBe(true);
  });

  it("re-checks a token that was never checked or has a malformed timestamp", () => {
    for (const checkedAt of [undefined, null, "123", NaN, Infinity, {}]) {
      expect(needsRecheck(checkedAt, NOW)).toBe(true);
    }
  });

  it("re-checks a timestamp from the future", () => {
    expect(needsRecheck(NOW + 1000, NOW)).toBe(true);
  });
});

describe("isSessionCurrent", () => {
  it("keeps a token whose version matches", () => {
    expect(isSessionCurrent(0, { sessionVersion: 0 })).toBe(true);
    expect(isSessionCurrent(3, { sessionVersion: 3 })).toBe(true);
  });

  it("ends the session after sign-out-everywhere bumps the version", () => {
    expect(isSessionCurrent(0, { sessionVersion: 1 })).toBe(false);
    expect(isSessionCurrent(2, { sessionVersion: 3 })).toBe(false);
  });

  it("ends the session when the user has been deleted", () => {
    expect(isSessionCurrent(0, null)).toBe(false);
    expect(isSessionCurrent(undefined, null)).toBe(false);
  });

  it("treats a token from before versioning as version 0", () => {
    expect(isSessionCurrent(undefined, { sessionVersion: 0 })).toBe(true);
    expect(isSessionCurrent(undefined, { sessionVersion: 1 })).toBe(false);
  });

  it("rejects a version that isn't a number", () => {
    for (const v of [null, "0", {}, [0]]) {
      expect(isSessionCurrent(v, { sessionVersion: 0 })).toBe(false);
    }
  });
});
