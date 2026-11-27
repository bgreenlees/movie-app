import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ auth: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: m.send };
  },
}));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/feedback", () => import("../../../lib/feedback"));
vi.mock("@/lib/rateLimit", () => import("../../../lib/rateLimit"));

const post = (POST: (r: Request) => Promise<Response>, body: unknown) =>
  POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body) }));

// A fresh module per test resets the in-memory rate limiter.
async function load() {
  vi.resetModules();
  return (await import("./route")).POST;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("FEEDBACK_TO", "owner@example.test");
  m.auth.mockResolvedValue({ user: { id: "u1", name: "T", email: "t@example.test" } });
  m.send.mockResolvedValue({ error: null });
});

describe("POST /api/feedback", () => {
  it("sends to FEEDBACK_TO", async () => {
    const res = await post(await load(), { message: "Add a dark mode" });
    expect(res.status).toBe(200);
    expect(m.send).toHaveBeenCalledWith(expect.objectContaining({ to: "owner@example.test" }));
  });

  it("rejects a non-string or empty message with 400", async () => {
    const POST = await load();
    for (const message of [undefined, "", "   ", 42, ["x"], { trim: "x" }]) {
      expect((await post(POST, { message })).status).toBe(400);
    }
    expect(m.send).not.toHaveBeenCalled();
  });

  it("accepts 5,000 characters and rejects 5,001 with 400", async () => {
    const POST = await load();
    expect((await post(POST, { message: "a".repeat(5000) })).status).toBe(200);
    expect((await post(POST, { message: "a".repeat(5001) })).status).toBe(400);
    expect(m.send).toHaveBeenCalledOnce();
  });

  it("allows 5 messages per user per hour, then 429", async () => {
    const POST = await load();
    for (let i = 0; i < 5; i++) expect((await post(POST, { message: `m${i}` })).status).toBe(200);
    const res = await post(POST, { message: "one too many" });
    expect(res.status).toBe(429);
    expect(m.send).toHaveBeenCalledTimes(5);

    m.auth.mockResolvedValue({ user: { id: "u2", name: "U", email: "u@example.test" } });
    expect((await post(POST, { message: "another user" })).status).toBe(200);
  });

  it("returns 500 without sending when FEEDBACK_TO is unset", async () => {
    vi.stubEnv("FEEDBACK_TO", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post(await load(), { message: "hi" });
    expect(res.status).toBe(500);
    expect(m.send).not.toHaveBeenCalled();
  });

  it("returns 401 when signed out", async () => {
    m.auth.mockResolvedValue(null);
    expect((await post(await load(), { message: "hi" })).status).toBe(401);
  });
});
