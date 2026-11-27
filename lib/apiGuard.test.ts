import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/rateLimit", () => import("./rateLimit"));

const { clientIp, limitByIp } = await import("./apiGuard");
const { createRateLimiter } = await import("./rateLimit");

const req = (headers: Record<string, string>) => new Request("http://localhost/api/x", { headers });

describe("clientIp", () => {
  it("takes the first x-forwarded-for entry", () => {
    expect(clientIp(req({ "x-forwarded-for": " 203.0.113.1 , 10.0.0.1" }))).toBe("203.0.113.1");
  });
  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIp(req({ "x-real-ip": "203.0.113.2" }))).toBe("203.0.113.2");
    expect(clientIp(req({}))).toBe("unknown");
  });
});

describe("limitByIp", () => {
  it("allows up to the limit per IP, then answers 429", async () => {
    const allow = createRateLimiter({ limit: 2, windowMs: 60_000 });
    const a = req({ "x-forwarded-for": "203.0.113.1" });
    expect(limitByIp(a, allow)).toBeNull();
    expect(limitByIp(a, allow)).toBeNull();
    const res = limitByIp(a, allow);
    expect(res?.status).toBe(429);
    expect(await res?.json()).toEqual({ error: "Too many requests" });
    expect(limitByIp(req({ "x-forwarded-for": "203.0.113.9" }), allow)).toBeNull();
  });
});
