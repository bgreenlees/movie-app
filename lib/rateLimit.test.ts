import { describe, expect, it } from "vitest";
import { createRateLimiter } from "./rateLimit";

describe("createRateLimiter", () => {
  it("allows `limit` hits per window, then refuses", () => {
    let t = 0;
    const check = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    expect(check("a")).toBe(true);
    expect(check("a")).toBe(true);
    expect(check("a")).toBe(false);
    t = 999;
    expect(check("a")).toBe(false);
  });

  it("frees a slot once the oldest hit leaves the window", () => {
    let t = 0;
    const check = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
    check("a");
    t = 500;
    check("a");
    t = 1000;
    expect(check("a")).toBe(true);
    expect(check("a")).toBe(false);
  });

  it("counts each key separately", () => {
    const check = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(check("a")).toBe(true);
    expect(check("b")).toBe(true);
    expect(check("a")).toBe(false);
  });

  it("refuses a bad limit", () => {
    expect(() => createRateLimiter({ limit: 0, windowMs: 1000 })).toThrow();
  });
});
