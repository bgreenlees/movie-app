import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    tVShow: { findUnique: vi.fn(), create: vi.fn() },
    tVWatchlistEntry: { upsert: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/tmdb", () => ({ tmdb: { getTVShowDetails: vi.fn() } }));
vi.mock("@/lib/validation", () => import("../../../../lib/validation"));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/tv/watchlist", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.tVShow.findUnique.mockResolvedValue({ id: 1399 });
  m.prisma.tVWatchlistEntry.upsert.mockResolvedValue({ id: "t1" });
});

describe("POST /api/tv/watchlist validation", () => {
  it.each([
    ["tvShowId abc", { tvShowId: "abc" }, "tvShowId"],
    ["rating 999", { tvShowId: 1399, rating: 999 }, "rating"],
    ["1 MB review", { tvShowId: 1399, review: "a".repeat(1_000_000) }, "review"],
    ["unknown status", { tvShowId: 1399, status: "BOGUS" }, "status"],
    ["season 501", { tvShowId: 1399, currentSeason: 501 }, "currentSeason"],
    ["episode -1", { tvShowId: 1399, currentEpisode: -1 }, "currentEpisode"],
  ])("returns 400 for %s", async (_n, body, field) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
    expect(m.prisma.tVWatchlistEntry.upsert).not.toHaveBeenCalled();
  });

  it("saves normal progress, and WATCHING is accepted", async () => {
    const res = await post({ tvShowId: 1399, status: "WATCHING", rating: null, currentSeason: 2, currentEpisode: 5, platform: null, review: null });
    expect(res.status).toBe(201);
    expect(m.prisma.tVWatchlistEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: "WATCHING", currentSeason: 2, currentEpisode: 5, rating: null }) })
    );
  });
});
