import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  requireConnection: vi.fn(),
  findUnique: vi.fn(),
  movies: vi.fn(),
  shows: vi.fn(),
  discover: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/connections", () => ({ requireConnection: m.requireConnection }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: m.findUnique },
    watchlistEntry: { findMany: m.movies },
    tVWatchlistEntry: { findMany: m.shows },
  },
}));
vi.mock("@/lib/tmdb", () => ({
  tmdb: {
    discover: m.discover,
    getTitleMoodFacts: vi.fn(),
    getMovieRecommendations: vi.fn(),
    getTVRecommendations: vi.fn(),
  },
}));

// The Vitest setup has no "@/" alias, so the route's pure helpers are mapped to
// the real modules here (only db, auth, connections and TMDB are faked).
vi.mock("@/lib/concurrency", () => import("../../../../../lib/concurrency"));
vi.mock("@/lib/decide", () => import("../../../../../lib/decide"));
vi.mock("@/lib/traits", () => import("../../../../../lib/traits"));
vi.mock("@/lib/pairPool", () => import("../../../../../lib/pairPool"));
vi.mock("@/lib/pairPoolLoader", () => import("../../../../../lib/pairPoolLoader"));

import { GET } from "./route";

const call = (userId: string, query = "") =>
  GET(new NextRequest(`http://localhost/api/watch-together/${userId}/picks${query}`), {
    params: Promise.resolve({ userId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "me1" } });
  m.requireConnection.mockResolvedValue({ id: "c1", requesterId: "me1", addresseeId: "pal1", status: "ACCEPTED" });
  m.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    name: where.id === "pal1" ? "Sam" : "Me",
    streamingServices: [],
  }));
  m.movies.mockResolvedValue([]);
  m.shows.mockResolvedValue([]);
  m.discover.mockImplementation(async (media: string) => ({
    total_results: 1,
    results:
      media === "movie"
        ? [{ id: 1, title: "A Film", poster_path: "/a.jpg", release_date: "2020-01-01", overview: "", popularity: 1, vote_average: 7, vote_count: 900, genre_ids: [18] }]
        : [{ id: 2, name: "A Show", poster_path: "/b.jpg", first_air_date: "2021-01-01", overview: "", popularity: 1, vote_average: 8, vote_count: 900, genre_ids: [18] }],
  }));
});

describe("GET /api/watch-together/[userId]/picks", () => {
  it("returns 401 with no session, before any lookup", async () => {
    m.auth.mockResolvedValue(null);
    expect((await call("pal1")).status).toBe(401);
    expect(m.requireConnection).not.toHaveBeenCalled();
  });

  it("returns 404 for a user who isn't connected", async () => {
    m.requireConnection.mockResolvedValue(null);
    expect((await call("stranger1")).status).toBe(404);
    expect(m.requireConnection).toHaveBeenCalledWith("me1", "stranger1");
    expect(m.movies).not.toHaveBeenCalled();
  });

  it("returns 404 for a malformed id without querying", async () => {
    expect((await call("../../x")).status).toBe(404);
    expect((await call("a".repeat(41))).status).toBe(404);
    expect(m.requireConnection).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid query value", async () => {
    expect((await call("pal1", "?vibe=sad")).status).toBe(400);
    expect(m.movies).not.toHaveBeenCalled();
  });

  it("returns movies and TV with the partner as { id, name } only", async () => {
    const res = await call("pal1", "?vibe=any");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partner).toEqual({ id: "pal1", name: "Sam" });
    expect(body.pool.map((c: { mediaType: string }) => c.mediaType).sort()).toEqual(["movie", "tv"]);
    expect(body.services).toEqual({ mine: false, partners: false, shared: [] });
    expect(body.coldStart).toEqual({ me: true, partner: true });
    expect(body.partial).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/email/i);
  });

  it("returns 502 when TMDB discover is down and nothing else qualifies", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    m.discover.mockRejectedValue(new Error("TMDB API error"));
    expect((await call("pal1")).status).toBe(502);
  });
});
