import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: {
    watchlistEntry: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
    movie: { findUnique: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/tmdb", () => ({ tmdb: { getMovieDetails: vi.fn() } }));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/validation", () => import("../../../lib/validation"));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://localhost/api/watchlist", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.watchlistEntry.findUnique.mockResolvedValue(null);
  m.prisma.movie.findUnique.mockResolvedValue({ id: 550 });
  m.prisma.watchlistEntry.create.mockResolvedValue({ id: "e1" });
});

describe("POST /api/watchlist validation", () => {
  it.each([
    ["rating 999", { movieId: 550, rating: 999 }, "rating"],
    ["1 MB review", { movieId: 550, review: "a".repeat(1_000_000) }, "review"],
    ["movieId abc", { movieId: "abc" }, "movieId"],
    ["missing movieId", {}, "movieId"],
    ["unknown status", { movieId: 550, status: "BOGUS" }, "status"],
    ["long platform", { movieId: 550, platform: "a".repeat(51) }, "platform"],
    ["long watchType", { movieId: 550, watchType: "a".repeat(51) }, "watchType"],
    ["invalid JSON", "{", "JSON"],
  ])("returns 400 for %s without touching the database", async (_n, body, field) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
    expect(m.prisma.watchlistEntry.create).not.toHaveBeenCalled();
  });

  it("saves what the UI sends (nulls for cleared fields)", async () => {
    const res = await post({ movieId: 550, status: "WATCHED", platform: null, watchType: null, rating: 4, review: null });
    expect(res.status).toBe(201);
    expect(m.prisma.watchlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ movieId: 550, status: "WATCHED", rating: 4, review: null, platform: null }) })
    );
  });

  it("defaults status to WANT_TO_WATCH", async () => {
    await post({ movieId: 550 });
    expect(m.prisma.watchlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "WANT_TO_WATCH" }) })
    );
  });
});
