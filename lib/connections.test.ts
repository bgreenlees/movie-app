import { describe, it, expect, vi, beforeEach } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { userConnection: { findFirst } } }));

import { requireConnection } from "./connections";

// A tiny fake table that applies the where clause the helper sends.
type Row = { id: string; requesterId: string; addresseeId: string; status: string };
function useRows(rows: Row[]) {
  findFirst.mockImplementation(async (args: { where: { status: string; OR: Partial<Row>[] } }) => {
    const where = args.where;
    return rows.find(
      (r) =>
        r.status === where.status &&
        where.OR.some((c) => r.requesterId === c.requesterId && r.addresseeId === c.addresseeId)
    ) ?? null;
  });
}

// Braces matter: returning the mock from beforeEach would make Vitest call it as a cleanup.
beforeEach(() => {
  findFirst.mockReset();
});

describe("requireConnection", () => {
  it("returns an accepted connection", async () => {
    const row = { id: "c1", requesterId: "a", addresseeId: "b", status: "ACCEPTED" };
    useRows([row]);
    expect(await requireConnection("a", "b")).toEqual(row);
  });

  it("works from either direction", async () => {
    const row = { id: "c1", requesterId: "a", addresseeId: "b", status: "ACCEPTED" };
    useRows([row]);
    expect(await requireConnection("b", "a")).toEqual(row);
  });

  it("returns null for a pending connection", async () => {
    useRows([{ id: "c1", requesterId: "a", addresseeId: "b", status: "PENDING" }]);
    expect(await requireConnection("a", "b")).toBeNull();
    expect(await requireConnection("b", "a")).toBeNull();
  });

  it("returns null for a declined connection", async () => {
    useRows([{ id: "c1", requesterId: "a", addresseeId: "b", status: "DECLINED" }]);
    expect(await requireConnection("a", "b")).toBeNull();
  });

  it("returns null when the users are not connected", async () => {
    useRows([{ id: "c1", requesterId: "a", addresseeId: "b", status: "ACCEPTED" }]);
    expect(await requireConnection("a", "c")).toBeNull();
  });

  it("returns null for self without querying", async () => {
    useRows([{ id: "c1", requesterId: "a", addresseeId: "a", status: "ACCEPTED" }]);
    expect(await requireConnection("a", "a")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("returns null for empty ids without querying", async () => {
    expect(await requireConnection("a", "")).toBeNull();
    expect(await requireConnection("", "a")).toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
