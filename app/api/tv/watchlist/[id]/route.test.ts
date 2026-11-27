import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: { tVWatchlistEntry: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/validation", () => import("../../../../../lib/validation"));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/tv/watchlist/t1", { method: "PATCH", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: "t1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.tVWatchlistEntry.findUnique.mockResolvedValue({ id: "t1", userId: "u1" });
  m.prisma.tVWatchlistEntry.update.mockResolvedValue({ id: "t1" });
});

describe("PATCH /api/tv/watchlist/[id] validation", () => {
  it.each([
    ["rating 999", { rating: 999 }, "rating"],
    ["1 MB review", { review: "a".repeat(1_000_000) }, "review"],
    ["unknown status", { status: "BOGUS" }, "status"],
    ["season 501", { currentSeason: 501 }, "currentSeason"],
    ["episode 1.5", { currentEpisode: 1.5 }, "currentEpisode"],
  ])("returns 400 for %s", async (_n, body, field) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
    expect(m.prisma.tVWatchlistEntry.update).not.toHaveBeenCalled();
  });

  it("updates progress and clears with null", async () => {
    const res = await patch({ currentSeason: 3, currentEpisode: null, rating: null });
    expect(res.status).toBe(200);
    expect(m.prisma.tVWatchlistEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentSeason: 3, currentEpisode: null, rating: null } })
    );
  });
});
