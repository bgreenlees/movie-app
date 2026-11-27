import { describe, it, expect } from "vitest";
import { isActivePath, NAV_LINKS, TAB_HREFS } from "./navLinks";

describe("isActivePath", () => {
  it("matches the exact page and nested pages", () => {
    expect(isActivePath("/watchlist", "/watchlist")).toBe(true);
    expect(isActivePath("/tv/watching/123", "/tv/watching")).toBe(true);
  });
  it("does not match lookalike prefixes or other pages", () => {
    expect(isActivePath("/news-extra", "/news")).toBe(false);
    expect(isActivePath("/tv", "/tv/watching")).toBe(false);
    expect(isActivePath(null, "/search")).toBe(false);
  });
});

describe("tab bar links", () => {
  it("are all real nav links, at most five", () => {
    const hrefs = NAV_LINKS.map((l) => l.href);
    expect(TAB_HREFS.length).toBeLessThanOrEqual(5);
    for (const h of TAB_HREFS) expect(hrefs).toContain(h);
  });
});
