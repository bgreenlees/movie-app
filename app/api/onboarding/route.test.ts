import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  movieFind: vi.fn(),
  movieCreate: vi.fn(),
  upsert: vi.fn(),
  userUpdate: vi.fn(),
  getMovieDetails: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({
  prisma: {
    movie: { findUnique: m.movieFind, create: m.movieCreate },
    watchlistEntry: { upsert: m.upsert },
    user: { update: m.userUpdate },
  },
}));
vi.mock("@/lib/tmdb", () => ({ tmdb: { getMovieDetails: m.getMovieDetails } }));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/concurrency", () => import("../../../lib/concurrency"));
vi.mock("@/lib/onboarding", () => import("../../../lib/onboarding"));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/onboarding", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.movieFind.mockResolvedValue(null);
  m.movieCreate.mockImplementation(async ({ data }: { data: { id: number } }) => data);
  m.getMovieDetails.mockImplementation(async (id: number) => ({ id, title: `M${id}`, genres: [] }));
});

describe("POST /api/onboarding", () => {
  it("rejects 10,000 ids with 400 and makes no TMDB calls or writes", async () => {
    const res = await post({ movieIds: [...Array(10000).keys()] });
    expect(res.status).toBe(400);
    expect(m.getMovieDetails).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
  });

  it("ignores ids outside the curated list", async () => {
    const res = await post({ movieIds: [1, 2, 3, 999999] });
    expect(res.status).toBe(200);
    expect(m.getMovieDetails).not.toHaveBeenCalled();
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.userUpdate).toHaveBeenCalledOnce();
  });

  it("adds curated ids, fetching TMDB only for movies not yet stored", async () => {
    m.movieFind.mockImplementation(async ({ where }: { where: { id: number } }) =>
      where.id === 603 ? { id: 603 } : null,
    );
    const res = await post({ movieIds: [603, 155, 155, 7] });
    expect(res.status).toBe(200);
    expect(m.getMovieDetails.mock.calls.map((c) => c[0])).toEqual([155]);
    expect(m.upsert).toHaveBeenCalledTimes(2);
  });

  it("caps concurrent TMDB calls", async () => {
    let active = 0;
    let peak = 0;
    m.getMovieDetails.mockImplementation(async (id: number) => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return { id, title: "x", genres: [] };
    });
    const { ONBOARDING_MOVIE_IDS } = await import("../../../lib/onboarding");
    await post({ movieIds: [...ONBOARDING_MOVIE_IDS] });
    expect(m.getMovieDetails).toHaveBeenCalledTimes(40);
    expect(peak).toBeLessThanOrEqual(5);
  });

  it("skips: marks onboarding complete without adding anything", async () => {
    const res = await post({ skipped: true, movieIds: [...Array(10000).keys()] });
    expect(res.status).toBe(200);
    expect(m.upsert).not.toHaveBeenCalled();
    expect(m.userUpdate).toHaveBeenCalledOnce();
  });
});
