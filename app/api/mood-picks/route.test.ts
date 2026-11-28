import { beforeEach, describe, expect, it, vi } from "vitest";

// Route-level tests for the error decision: when every runtime check fails, the
// route returns 500 unless the pool still has TV; and the abort branch returns 499.
// Auth, Prisma and TMDB are mocked: no network, no database.
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    watchlistEntry: { findMany: vi.fn() },
    tVWatchlistEntry: { findMany: vi.fn() },
  },
  tmdb: { discover: vi.fn(), getTitleMoodFacts: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/tmdb", () => ({ tmdb: m.tmdb }));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/providers", () => import("../../../lib/providers"));
vi.mock("@/lib/concurrency", () => import("../../../lib/concurrency"));
vi.mock("@/lib/moodPicker", () => import("../../../lib/moodPicker"));

import { GET } from "./route";

const movie = (id: number) => ({
  id, title: `M${id}`, poster_path: null, release_date: "2024-01-01", overview: "",
  popularity: 10, vote_average: 7, vote_count: 500, genre_ids: [18],
});
const show = (id: number) => ({
  id, name: `S${id}`, poster_path: null, first_air_date: "2024-01-01", overview: "",
  popularity: 10, vote_average: 7, vote_count: 500, genre_ids: [18],
});

function discover(opts: { movies?: boolean; tv?: boolean }) {
  m.tmdb.discover.mockImplementation(async (type: "movie" | "tv") => {
    if (type === "movie") return { total_results: opts.movies ? 3 : 0, results: opts.movies ? [movie(1), movie(2), movie(3)] : [] };
    return { total_results: opts.tv ? 3 : 0, results: opts.tv ? [show(11), show(12), show(13)] : [] };
  });
}

const get = (query: string, signal?: AbortSignal) =>
  GET({ nextUrl: new URL(`http://localhost/api/mood-picks?${query}`), signal: signal ?? new AbortController().signal } as never);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.user.findUnique.mockResolvedValue({ streamingServices: [] });
  m.prisma.watchlistEntry.findMany.mockResolvedValue([]);
  m.prisma.tVWatchlistEntry.findMany.mockResolvedValue([]);
  m.tmdb.getTitleMoodFacts.mockRejectedValue(new Error("TMDB down"));
});

describe("GET /api/mood-picks error decision", () => {
  it("returns 401 when signed out", async () => {
    m.auth.mockResolvedValue(null);
    expect((await get("time=30")).status).toBe(401);
  });

  it("returns 500 when every runtime check fails and the pool is movies only", async () => {
    discover({ movies: true });
    const res = await get("media=movie&time=30");
    expect(res.status).toBe(500);
  });

  it("falls back to the TV titles when every runtime check fails but the pool has TV", async () => {
    discover({ movies: true, tv: true });
    const res = await get("media=both&time=30");
    expect(res.status).toBe(200);
    const { pool } = await res.json();
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((c: { mediaType: string }) => c.mediaType === "tv")).toBe(true);
  });

  it("keeps movies whose runtime check passes", async () => {
    discover({ movies: true });
    m.tmdb.getTitleMoodFacts.mockResolvedValue({ runtime: 25 });
    const res = await get("media=movie&time=30");
    expect(res.status).toBe(200);
    expect((await res.json()).pool).toHaveLength(9); // 3 per discover page
  });

  it("checks at most 25 movie runtimes (maxChecks is wired)", async () => {
    m.tmdb.discover.mockImplementation(async (_type: string, _params: unknown, page: number) => ({
      total_results: 100,
      results: Array.from({ length: 20 }, (_, i) => movie(page * 100 + i)),
    }));
    m.tmdb.getTitleMoodFacts.mockResolvedValue({ runtime: 25 });
    const res = await get("media=movie&time=30");
    expect(res.status).toBe(200);
    expect(m.tmdb.getTitleMoodFacts).toHaveBeenCalledTimes(25);
    expect((await res.json()).pool).toHaveLength(25);
  });

  it("returns 499 without logging an error when the client aborted", async () => {
    discover({ movies: true });
    const ac = new AbortController();
    ac.abort();
    const res = await get("media=movie&time=30", ac.signal);
    expect(res.status).toBe(499);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("doesn't warn about watchlist checks that failed because the request was aborted", async () => {
    discover({ tv: true });
    m.prisma.tVWatchlistEntry.findMany.mockResolvedValue([
      { id: "e1", tvShowId: 99, status: "WANT_TO_WATCH", platform: null, rating: null, review: null, currentSeason: null, currentEpisode: null },
    ]);
    const ac = new AbortController();
    ac.abort();
    await get("media=tv", ac.signal);
    expect(console.warn).not.toHaveBeenCalledWith(expect.stringContaining("watchlist checks"));
  });
});
