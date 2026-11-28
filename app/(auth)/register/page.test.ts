import { describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/callbackUrl", () => import("../../../lib/callbackUrl"));

import RegisterPage from "./page";

async function go(params: Record<string, string>) {
  redirect.mockClear();
  await RegisterPage({ searchParams: Promise.resolve(params) });
  return redirect.mock.calls[0][0];
}

describe("/register", () => {
  it("forwards to /login and keeps a safe callbackUrl", async () => {
    expect(await go({ callbackUrl: "/what-to-watch" })).toBe("/login?callbackUrl=%2Fwhat-to-watch");
  });
  it("drops an unsafe callbackUrl", async () => {
    expect(await go({ callbackUrl: "https://evil.example" })).toBe("/login");
    expect(await go({ callbackUrl: "//evil.example" })).toBe("/login");
  });
  it("goes to plain /login without one", async () => {
    expect(await go({})).toBe("/login");
  });
});
