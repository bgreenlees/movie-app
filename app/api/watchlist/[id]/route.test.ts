import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: { watchlistEntry: { findUnique: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/validation", () => import("../../../../lib/validation"));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/watchlist/e1", { method: "PATCH", body: JSON.stringify(body) }) as never, {
    params: Promise.resolve({ id: "e1" }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.watchlistEntry.findUnique.mockResolvedValue({ id: "e1", userId: "u1" });
  m.prisma.watchlistEntry.update.mockResolvedValue({ id: "e1" });
});

describe("PATCH /api/watchlist/[id] validation", () => {
  it.each([
    ["rating 999", { rating: 999 }, "rating"],
    ["rating 0", { rating: 0 }, "rating"],
    ["1 MB review", { review: "a".repeat(1_000_000) }, "review"],
    ["unknown status", { status: "BOGUS" }, "status"],
    ["long platform", { platform: "a".repeat(51) }, "platform"],
  ])("returns 400 for %s", async (_n, body, field) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain(field);
    expect(m.prisma.watchlistEntry.update).not.toHaveBeenCalled();
  });

  it("clears a rating with null and only updates the fields sent", async () => {
    const res = await patch({ rating: null, review: "Great" });
    expect(res.status).toBe(200);
    expect(m.prisma.watchlistEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rating: null, review: "Great" } })
    );
  });

  it("sets watchedAt when marking WATCHED", async () => {
    await patch({ status: "WATCHED" });
    const data = m.prisma.watchlistEntry.update.mock.calls[0][0].data;
    expect(data.status).toBe("WATCHED");
    expect(data.watchedAt).toBeInstanceOf(Date);
  });
});
