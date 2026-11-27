import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  prisma: { user: { update: vi.fn(), findUnique: vi.fn() } },
}));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/providers", () => ({ canonicalProviderIds: (x: number[]) => x }));
vi.mock("@/lib/validation", () => import("../../../../lib/validation"));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(new Request("http://localhost/api/user/streaming", { method: "PATCH", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  m.prisma.user.update.mockResolvedValue({ streamingServices: [8] });
});

describe("PATCH /api/user/streaming validation", () => {
  it.each([
    ["20,000 items", { streamingServices: Array(20000).fill(8) }],
    ["non-number element", { streamingServices: [8, "x"] }],
    ["non-array", { streamingServices: "8" }],
    ["missing", {}],
  ])("returns 400 for %s", async (_n, body) => {
    const res = await patch(body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("streamingServices");
    expect(m.prisma.user.update).not.toHaveBeenCalled();
  });

  it("saves a normal selection, including an empty one", async () => {
    expect((await patch({ streamingServices: [8, 337] })).status).toBe(200);
    expect((await patch({ streamingServices: [] })).status).toBe(200);
  });
});
