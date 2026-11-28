import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const updateMany = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/db", () => ({ prisma: { user: { updateMany } } }));

import { DELETE } from "./route";

beforeEach(() => {
  auth.mockReset();
  updateMany.mockReset();
});

describe("DELETE /api/user/sessions", () => {
  it("returns 401 without a session and touches nothing", async () => {
    auth.mockResolvedValue(null);
    const res = await DELETE();
    expect(res.status).toBe(401);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("bumps only the signed-in user's sessionVersion", async () => {
    auth.mockResolvedValue({ user: { id: "u1" } });
    updateMany.mockResolvedValue({ count: 1 });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { sessionVersion: { increment: 1 } },
    });
  });

  it("returns 401 when the user no longer exists", async () => {
    auth.mockResolvedValue({ user: { id: "gone" } });
    updateMany.mockResolvedValue({ count: 0 });
    expect((await DELETE()).status).toBe(401);
  });
});
