import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Security audit F1: the TMDB proxies only the signed-in UI uses must answer 401
// without a session, and must not call TMDB first.

const m = vi.hoisted(() => ({ auth: vi.fn(), tmdbCalls: [] as string[] }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
// Any tmdb.* call is recorded and fails, so a guard that runs too late shows up.
vi.mock("@/lib/tmdb", () => ({
  tmdb: new Proxy(
    {},
    {
      get: (_t, name) => () => {
        m.tmdbCalls.push(String(name));
        return Promise.reject(new Error("TMDB must not be called"));
      },
    }
  ),
}));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/apiGuard", () => import("../../lib/apiGuard"));
vi.mock("@/lib/rateLimit", () => import("../../lib/rateLimit"));
vi.mock("@/lib/fuzzySearch", () => import("../../lib/fuzzySearch"));
vi.mock("@/lib/countries", () => import("../../lib/countries"));
vi.mock("@/lib/discoverPaging", () => import("../../lib/discoverPaging"));
vi.mock("@/lib/onboarding", () => import("../../lib/onboarding"));
vi.mock("@/lib/providers", () => import("../../lib/providers"));
vi.mock("@/lib/contextualFeed", () => import("../../lib/contextualFeed"));
// news reads the signed-in user's streaming services.
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn().mockResolvedValue({ streamingServices: [] }) }, watchlistEntry: { count: vi.fn().mockResolvedValue(0) } } }));

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;

// [route, module, url, params] — params are valid, so only the session check can fail.
const PROTECTED: Array<[string, () => Promise<{ GET: unknown }>, string, Record<string, string>]> = [
  ["/api/movies/search", () => import("./movies/search/route"), "/api/movies/search?q=zzqx", {}],
  ["/api/tv/search", () => import("./tv/search/route"), "/api/tv/search?q=zzqx", {}],
  ["/api/search/multi", () => import("./search/multi/route"), "/api/search/multi?q=alien", {}],
  ["/api/person/[id]", () => import("./person/[id]/route"), "/api/person/287", { id: "287" }],
  ["/api/discover/movie", () => import("./discover/movie/route"), "/api/discover/movie?genreId=28", {}],
  ["/api/discover/tv", () => import("./discover/tv/route"), "/api/discover/tv?genreId=18", {}],
  ["/api/movies/[id]/credits", () => import("./movies/[id]/credits/route"), "/api/movies/550/credits", { id: "550" }],
  ["/api/tv/[id]/credits", () => import("./tv/[id]/credits/route"), "/api/tv/1396/credits", { id: "1396" }],
  ["/api/tv/[id]/season/[number]", () => import("./tv/[id]/season/[number]/route"), "/api/tv/1396/season/1", { id: "1396", number: "1" }],
  ["/api/movies/[id]/recommendations", () => import("./movies/[id]/recommendations/route"), "/api/movies/550/recommendations", { id: "550" }],
  ["/api/tv/[id]/recommendations", () => import("./tv/[id]/recommendations/route"), "/api/tv/1396/recommendations", { id: "1396" }],
  // Only called from signed-in pages (search, profile, onboarding, new releases).
  ["/api/genres", () => import("./genres/route"), "/api/genres?media=tv", {}],
  ["/api/movies/contextual", () => import("./movies/contextual/route"), "/api/movies/contextual", {}],
  ["/api/movies/providers", () => import("./movies/providers/route"), "/api/movies/providers", {}],
  ["/api/onboarding/movies", () => import("./onboarding/movies/route"), "/api/onboarding/movies", {}],
  ["/api/movies/news", () => import("./movies/news/route"), "/api/movies/news", {}],
];

// Public (fetched by the signed-out /movie/[id] and /tv/[id] pages, or harmless), rate-limited per IP.
const PUBLIC: Array<[string, () => Promise<{ GET: unknown }>, string, Record<string, string>]> = [
  ["/api/movies/[id]/trailer", () => import("./movies/[id]/trailer/route"), "/api/movies/550/trailer", { id: "550" }],
  ["/api/tv/[id]/trailer", () => import("./tv/[id]/trailer/route"), "/api/tv/1396/trailer", { id: "1396" }],
  ["/api/movies/[id]/providers", () => import("./movies/[id]/providers/route"), "/api/movies/550/providers", { id: "550" }],
  ["/api/tv/[id]/providers", () => import("./tv/[id]/providers/route"), "/api/tv/1396/providers", { id: "1396" }],
  ["/api/tv/[id]/info", () => import("./tv/[id]/info/route"), "/api/tv/1396/info", { id: "1396" }],
  ["/api/movies/popular", () => import("./movies/popular/route"), "/api/movies/popular", {}],
];

async function call(load: () => Promise<{ GET: unknown }>, url: string, params: Record<string, string>, ip = "203.0.113.7") {
  const { NextRequest } = await import("next/server");
  const GET = (await load()).GET as Handler;
  const req = new NextRequest(new URL(url, "http://localhost"), { headers: { "x-forwarded-for": ip } });
  return GET(req, { params: Promise.resolve(params) });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.tmdbCalls.length = 0;
  m.auth.mockResolvedValue(null);
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network must not be called"))));
});

describe("TMDB proxies that need a session", () => {
  it.each(PROTECTED)("%s returns 401 without a session and calls nothing", async (_route, load, url, params) => {
    const res = await call(load, url, params);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
    expect(m.tmdbCalls).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(PROTECTED)("%s returns 401 for a session without a user id", async (_route, load, url, params) => {
    m.auth.mockResolvedValue({ user: {} });
    expect((await call(load, url, params)).status).toBe(401);
  });

  it.each(PROTECTED)("%s gets past the guard when signed in", async (_route, load, url, params) => {
    m.auth.mockResolvedValue({ user: { id: "u1" } });
    const res = await call(load, url, params);
    expect(res.status).not.toBe(401);
    expect(m.tmdbCalls.length + vi.mocked(fetch).mock.calls.length).toBeGreaterThan(0);
  });
});

describe("public TMDB proxies", () => {
  it.each(PUBLIC)("%s needs no session", async (_route, load, url, params) => {
    const res = await call(load, url, params, `198.51.100.${PUBLIC.findIndex((p) => p[2] === url)}`);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(429);
    expect(m.auth).not.toHaveBeenCalled();
  });

  it("share one per-IP budget and answer 429 past it, before calling TMDB", async () => {
    const { PUBLIC_LIMIT } = await import("../../lib/apiGuard");
    const ip = "192.0.2.55";
    for (let i = 0; i < PUBLIC_LIMIT.limit; i++) {
      const [, load, url, params] = PUBLIC[i % PUBLIC.length];
      expect((await call(load, url, params, ip)).status).not.toBe(429);
    }
    const calls = m.tmdbCalls.length;
    for (const [, load, url, params] of PUBLIC) {
      const res = await call(load, url, params, ip);
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("60");
    }
    expect(m.tmdbCalls.length).toBe(calls);
    // Another IP is unaffected.
    const [, load, url, params] = PUBLIC[0];
    expect((await call(load, url, params, "192.0.2.56")).status).not.toBe(429);
  });
});

// Routes that call TMDB but already check the session themselves (they read the user's
// own data too), so they are covered by their own tests rather than this table.
const OWN_AUTH = new Set([
  "decide", "mood-picks", "movies/recommended", "tv/recommended", "tv/watchlist",
  "watchlist", "watch-together/[userId]", "onboarding",
]);

function routeFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return routeFiles(full, base);
    return e.name === "route.ts" ? [full.slice(base.length + 1).replace(/\/?route\.ts$/, "")] : [];
  });
}

describe("coverage", () => {
  it("every route that calls TMDB is listed above or has its own auth", () => {
    const listed = new Set([...PROTECTED, ...PUBLIC].map(([route]) => route.replace(/^\/api\//, "")));
    const unlisted = routeFiles(__dirname).filter((route) => {
      const src = readFileSync(join(__dirname, route, "route.ts"), "utf8");
      const callsTmdb = /@\/lib\/(tmdb|fuzzySearch)"/.test(src);
      return callsTmdb && !listed.has(route) && ![...OWN_AUTH].some((o) => route === o || route.startsWith(o + "/"));
    });
    expect(unlisted).toEqual([]);
  });
});
