import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./signInError";

describe("signInErrorMessage", () => {
  it("returns null when there is no error", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
    expect(signInErrorMessage([])).toBeNull();
  });

  it("explains an unverified Google email", () => {
    expect(signInErrorMessage("AccessDenied")).toMatch(/verified/);
  });

  it("uses the first value when the code repeats", () => {
    expect(signInErrorMessage(["AccessDenied", "x"])).toBe(signInErrorMessage("AccessDenied"));
  });

  it("never echoes an unknown code", () => {
    const msg = signInErrorMessage("<b>Call 555-0100</b>");
    expect(msg).toBe("Something went wrong signing you in. Please try again.");
    expect(signInErrorMessage("toString")).toBe(msg);
    expect(signInErrorMessage("__proto__")).toBe(msg);
  });
});
