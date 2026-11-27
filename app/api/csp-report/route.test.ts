import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/cspReport", () => import("../../../lib/cspReport"));
vi.mock("@/lib/rateLimit", () => import("../../../lib/rateLimit"));

const report = {
  "csp-report": {
    "document-uri": "https://whatsupnext.site/search?q=secret",
    "blocked-uri": "https://evil.example/x.js",
    "effective-directive": "script-src-elem",
  },
};

const post = (POST: (r: Request) => Promise<Response>, body: string, type = "application/csp-report", ip = "1.2.3.4") =>
  POST(
    new Request("http://localhost/api/csp-report", {
      method: "POST",
      headers: { "content-type": type, "x-forwarded-for": ip },
      body,
    }),
  );

// A fresh module per test resets the in-memory rate limiter.
async function load() {
  vi.resetModules();
  return (await import("./route")).POST;
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warn.mockRestore());

describe("POST /api/csp-report", () => {
  it("logs one redacted line per violation and answers 204", async () => {
    const res = await post(await load(), JSON.stringify(report));
    expect(res.status).toBe(204);
    expect(warn).toHaveBeenCalledTimes(1);
    const [tag, line] = warn.mock.calls[0];
    expect(tag).toBe("[csp-violation]");
    expect(JSON.parse(line as string)).toMatchObject({
      documentUrl: "https://whatsupnext.site/search",
      blockedUrl: "https://evil.example/x.js",
      directive: "script-src-elem",
    });
    expect(line).not.toContain("secret");
  });

  it("accepts Reporting API bodies", async () => {
    const body = [{ type: "csp-violation", body: { effectiveDirective: "img-src" } }];
    await post(await load(), JSON.stringify(body), "application/reports+json");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("ignores other content types, bad JSON and oversized bodies", async () => {
    const POST = await load();
    for (const res of [
      await post(POST, JSON.stringify(report), "text/plain"),
      await post(POST, "{not json"),
      await post(POST, JSON.stringify({ ...report, pad: "x".repeat(20_000) })),
    ]) {
      expect(res.status).toBe(204);
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it("rate-limits each client", async () => {
    const POST = await load();
    for (let i = 0; i < 35; i++) await post(POST, JSON.stringify(report));
    expect(warn).toHaveBeenCalledTimes(30);
    await post(POST, JSON.stringify(report), "application/csp-report", "5.6.7.8");
    expect(warn).toHaveBeenCalledTimes(31);
  });
});
