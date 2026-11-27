import { describe, expect, it } from "vitest";
import { DEFAULT_CALLBACK_URL, loginUrlWithCallback, safeCallbackUrl } from "./callbackUrl";

describe("safeCallbackUrl", () => {
  it("keeps same-origin relative paths, including query and hash", () => {
    expect(safeCallbackUrl("/decide/abc")).toBe("/decide/abc");
    expect(safeCallbackUrl("/movie/12?x=1#top")).toBe("/movie/12?x=1#top");
    expect(safeCallbackUrl("/")).toBe("/");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/search",
    "//evil.example",
    "///evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "\\/evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "javascript:alert(1)",
    "evil.example",
    "search",
    "",
    " /search",
  ])("falls back for %j", (bad) => {
    expect(safeCallbackUrl(bad)).toBe(DEFAULT_CALLBACK_URL);
  });

  it("falls back for non-strings and missing values", () => {
    expect(safeCallbackUrl(undefined)).toBe("/search");
    expect(safeCallbackUrl(null)).toBe("/search");
    expect(safeCallbackUrl(42)).toBe("/search");
    expect(safeCallbackUrl({})).toBe("/search");
  });

  it("uses the first value when the param is repeated", () => {
    expect(safeCallbackUrl(["/decide/abc", "https://evil.example"])).toBe("/decide/abc");
    expect(safeCallbackUrl(["https://evil.example", "/decide/abc"])).toBe("/search");
  });

  it("rejects absurdly long values", () => {
    expect(safeCallbackUrl("/" + "a".repeat(5000))).toBe("/search");
  });

  it("honours a custom fallback", () => {
    expect(safeCallbackUrl("//evil.example", "/")).toBe("/");
  });
});

describe("loginUrlWithCallback", () => {
  it("encodes the path", () => {
    expect(loginUrlWithCallback("/decide/abc?x=1")).toBe("/login?callbackUrl=%2Fdecide%2Fabc%3Fx%3D1");
  });
  it("drops an unsafe path", () => {
    expect(loginUrlWithCallback("//evil.example")).toBe("/login");
  });
});
