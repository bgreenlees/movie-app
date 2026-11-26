import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  requireConnection: vi.fn(),
  findUnique: vi.fn(),
  movies: vi.fn(),
  shows: vi.fn(),
  movieRecs: vi.fn(),
  tvRecs: vi.fn(),
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
  tmdb: { getMovieRecommendations: m.movieRecs, getTVRecommendations: m.tvRecs },
}));
// No "@/" alias in the Vitest setup: map the pure helpers to the real modules.
vi.mock("@/lib/decide", () => import("../../../../lib/decide"));
vi.mock("@/lib/watchTogetherShelves", () => import("../../../../lib/watchTogetherShelves"));

import { GET } from "./route";

const call = (userId: string) =>
  GET(new NextRequest(`http://localhost/api/watch-together/${userId}`), {
    params: Promise.resolve({ userId }),
  });

const added = new Date("2026-01-01");
const movie = (movieId: number, status: string, rating: number | null = null) => ({
  movieId, status, rating, addedAt: added,
  movie: { title: `Film ${movieId}`, posterPath: "/m.jpg", releaseDate: "2020-01-01" },
});
const show = (tvShowId: number, status: string, rating: number | null = null) => ({
  tvShowId, status, rating, addedAt: added,
  tvShow: { name: `Show ${tvShowId}`, posterPath: "/t.jpg", firstAirDate: "2021-01-01" },
});

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "me1" } });
  m.requireConnection.mockResolvedValue({ id: "c1", status: "ACCEPTED" });
  m.findUnique.mockResolvedValue({ name: "Sam" });
  m.movies.mockImplementation(async ({ where }: { where: { userId: string } }) =>
    where.userId === "me1" ? [movie(1, "WANT_TO_WATCH")] : [movie(1, "WANT_TO_WATCH")]
  );
  m.shows.mockImplementation(async ({ where }: { where: { userId: string } }) =>
    where.userId === "me1"
      ? [show(10, "WANT_TO_WATCH"), show(20, "WATCHED", 3)]
      : [show(10, "WANT_TO_WATCH"), show(20, "WATCHED", 3), show(30, "WATCHED", 3)]
  );
  m.movieRecs.mockResolvedValue({ results: [] });
  m.tvRecs.mockResolvedValue({
    results: [{ id: 40, name: "Rec Show", poster_path: "/r.jpg", first_air_date: "2022-01-01" }],
  });
});

describe("GET /api/watch-together/[userId]", () => {
  it("returns 401 with no session", async () => {
    m.auth.mockResolvedValue(null);
    expect((await call("pal1")).status).toBe(401);
    expect(m.requireConnection).not.toHaveBeenCalled();
  });

  it("returns 404 for an unconnected or malformed id", async () => {
    expect((await call("../x")).status).toBe(404);
    m.requireConnection.mockResolvedValue(null);
    expect((await call("stranger1")).status).toBe(404);
    expect(m.movies).not.toHaveBeenCalled();
  });

  it("includes TV in the shelves and seeds fresh picks from a show both loved", async () => {
    const body = await (await call("pal1")).json();
    const keys = (xs: { mediaType: string; id: number }[]) => xs.map((x) => `${x.mediaType}-${x.id}`).sort();
    expect(keys(body.bothWantToWatch)).toEqual(["movie-1", "tv-10"]);
    expect(keys(body.friendLovedForMe)).toEqual(["tv-30"]);
    expect(m.tvRecs).toHaveBeenCalledWith(20);
    expect(keys(body.freshPicks)).toEqual(["tv-40"]);
  });

  it("returns the friend as { id, name } with no email", async () => {
    const body = await (await call("pal1")).json();
    expect(body.friend).toEqual({ id: "pal1", name: "Sam" });
    expect(m.findUnique).toHaveBeenCalledWith({ where: { id: "pal1" }, select: { name: true } });
    expect(JSON.stringify(body)).not.toMatch(/email/i);
  });

  it("still loads when a TMDB recommendation call fails", async () => {
    m.tvRecs.mockRejectedValue(new Error("down"));
    const res = await call("pal1");
    expect(res.status).toBe(200);
    expect((await res.json()).freshPicks).toEqual([]);
  });
});
