import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A tiny in-memory stand-in for the two Prisma models these routes use, so the
// tests can follow a request through send → decline → re-send across routes.
type Row = { id: string; requesterId: string; addresseeId: string; status: string };
type Where = {
  id?: string;
  requesterId?: string;
  addresseeId?: string;
  status?: string;
  OR?: Where[];
};

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  recordInvite: vi.fn<(...args: unknown[]) => Promise<{ previousSentAt: Date | null } | null>>(async () => ({ previousSentAt: null })),
  deliverInvite: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  allow: vi.fn((key: string) => key !== ""),
  limiterOpts: undefined as unknown,
  openInvites: 0,
  users: [] as { id: string; email: string; name: string }[],
  rows: [] as Row[],
  nextId: 1,
  lock: Promise.resolve() as Promise<void>,
  countDelay: false,
}));

function matches(row: Row, where: Where): boolean {
  if (where.OR && !where.OR.some((w) => matches(row, w))) return false;
  return (["id", "requesterId", "addresseeId", "status"] as const).every(
    (k) => where[k] === undefined || row[k] === where[k],
  );
}

vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/rateLimit", () => ({
  createRateLimiter: (opts: unknown) => {
    m.limiterOpts = opts;
    return (key: string) => m.allow(key);
  },
}));
// Invite creation has its own tests (lib/invites.test.ts); here we only check the route calls it.
vi.mock("@/lib/invites", () => ({ recordInvite: m.recordInvite, deliverInvite: m.deliverInvite }));
// after() only works inside a real request, so run its callback straight away, un-awaited,
// the way Vercel runs it once the response has gone out.
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: (fn: () => unknown) => void fn(),
}));
vi.mock("@/lib/db", () => {
  const connectionInvite = { count: vi.fn(async () => m.openInvites) };
  const userConnection = {
    count: vi.fn(async ({ where }: { where: Where }) => {
      const n = m.rows.filter((r) => matches(r, where)).length;
      // Widen the count-then-create window so an unlocked implementation races.
      if (m.countDelay) await new Promise((r) => setTimeout(r, 1));
      return n;
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => m.rows.find((r) => matches(r, where)) ?? null),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => m.rows.find((r) => r.id === where.id) ?? null),
    findMany: vi.fn(async ({ where }: { where: Where }) =>
      m.rows
        .filter((r) => matches(r, where))
        .map((r) => ({
          ...r,
          requester: m.users.find((u) => u.id === r.requesterId),
          addressee: m.users.find((u) => u.id === r.addresseeId),
        })),
    ),
    create: vi.fn(async ({ data }: { data: { requesterId: string; addresseeId: string } }) => {
      const row = { id: `c${m.nextId++}`, status: "PENDING", ...data };
      m.rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
      const row = m.rows.find((r) => r.id === where.id)!;
      row.status = data.status;
      return row;
    }),
    delete: vi.fn(async ({ where }: { where: { id: string } }) => {
      m.rows = m.rows.filter((r) => r.id !== where.id);
      return {};
    }),
  };
  return {
    prisma: {
      // Tagged template: the bound value is the one interpolation. Mimics
      // LOWER(email) = $1, i.e. exact equality with no wildcards.
      $queryRaw: vi.fn(async (_strings: TemplateStringsArray, value: string) =>
        m.users.filter((u) => u.email.toLowerCase() === value).slice(0, 1),
      ),
      userConnection,
      connectionInvite,
      // Interactive transactions only. $executeRaw stands in for the advisory
      // lock: the first call per tx takes a mutex that is released when the
      // transaction ends, so parallel sends by one user run one at a time.
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        let release: (() => void) | undefined;
        const tx = {
          userConnection,
          connectionInvite,
          $executeRaw: async () => {
            const prev = m.lock;
            let done!: () => void;
            m.lock = new Promise<void>((r) => (done = r));
            release = done;
            await prev;
          },
        };
        try {
          return await fn(tx);
        } finally {
          release?.();
        }
      }),
    },
  };
});

import { GET, POST, MAX_PENDING_OUTGOING } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const ME = { id: "me", email: "me@example.test", name: "Me" };
const PAL = { id: "pal", email: "pal@example.test", name: "Pal" };
const OTHER = { id: "other", email: "other@example.test", name: "Other" };

const as = (user: { id: string; email: string } | null) =>
  m.auth.mockResolvedValue(user ? { user: { id: user.id, email: user.email } } : null);

const send = (email: unknown) =>
  POST(
    new NextRequest("http://localhost/api/connections", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  );
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const decline = (id: string) =>
  DELETE(new NextRequest(`http://localhost/api/connections/${id}`, { method: "DELETE" }), ctx(id));
const accept = (id: string) =>
  PATCH(new NextRequest(`http://localhost/api/connections/${id}`, { method: "PATCH" }), ctx(id));
const list = async () => (await GET()).json();

beforeEach(() => {
  m.users = [ME, PAL, OTHER];
  m.rows = [];
  m.nextId = 1;
  m.lock = Promise.resolve();
  m.countDelay = false;
  as(ME);
  m.allow.mockReset().mockReturnValue(true);
  m.recordInvite.mockClear();
  m.openInvites = 0;
  m.deliverInvite.mockClear();
});

describe("POST /api/connections: invites (#135)", () => {
  it("counts unaccepted invites toward the pending cap, so known and unknown emails both get the same 429", async () => {
    for (let i = 0; i < MAX_PENDING_OUTGOING - 1; i++) {
      m.rows.push({ id: `p${i}`, requesterId: ME.id, addresseeId: `x${i}`, status: "PENDING" });
    }
    m.openInvites = 1;
    const unknown = await send("nobody@example.test");
    const known = await send(PAL.email);
    expect(unknown.status).toBe(429);
    expect(known.status).toBe(429);
    expect(await known.json()).toEqual(await unknown.json());
    expect(m.recordInvite).not.toHaveBeenCalled();
  });
  it("answers the neutral 200 even if recording the invite fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.recordInvite.mockRejectedValueOnce(new Error("db down"));
    const res = await send("nobody@example.test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.deliverInvite).not.toHaveBeenCalled();
  });
  it("invites an unknown email, normalised, with the neutral response", async () => {
    const res = await send("  New.Person@Example.TEST ");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.recordInvite).toHaveBeenCalledWith("new.person@example.test", "me", expect.any(Date));
    expect(m.deliverInvite).toHaveBeenCalledWith("new.person@example.test", "me", "", { previousSentAt: null });
  });
  it("answers without waiting for the email to be sent (no timing oracle)", async () => {
    m.deliverInvite.mockReturnValueOnce(new Promise(() => {})); // never resolves
    const res = await send("new.person@example.test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(m.deliverInvite).toHaveBeenCalledOnce();
  });
  it("sends nothing when the invite was already emailed recently", async () => {
    m.recordInvite.mockResolvedValueOnce(null);
    expect((await send("new.person@example.test")).status).toBe(200);
    expect(m.deliverInvite).not.toHaveBeenCalled();
  });
  it("doesn't invite an email that has an account", async () => {
    await send(PAL.email);
    expect(m.recordInvite).not.toHaveBeenCalled();
  });
  it("rejects malformed or over-long emails with 400 and no invite", async () => {
    for (const bad of ["not-an-email", "a@b", "a".repeat(250) + "@b.de"]) {
      expect((await send(bad)).status).toBe(400);
    }
    expect(m.recordInvite).not.toHaveBeenCalled();
  });
  it("limits to 10 a day, and answers 429 the same for known and unknown emails", async () => {
    expect(m.limiterOpts).toEqual({ limit: 10, windowMs: 24 * 60 * 60 * 1000 });
    m.allow.mockReturnValue(false);
    const unknown = await send("nobody@example.test");
    const known = await send(PAL.email);
    expect(unknown.status).toBe(429);
    expect(known.status).toBe(429);
    expect(await known.json()).toEqual(await unknown.json());
    expect(m.recordInvite).not.toHaveBeenCalled();
  });
});

describe("POST /api/connections: no email oracle (F7)", () => {
  it("answers an unknown email and a registered email identically", async () => {
    const unknown = await send("nobody@example.test");
    const known = await send(PAL.email);
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(await (await send("nobody2@example.test")).json()).toEqual({ ok: true });
  });

  it("creates a row only when the user exists", async () => {
    await send("nobody@example.test");
    expect(m.rows).toHaveLength(0);
    await send(PAL.email);
    expect(m.rows).toEqual([{ id: "c1", requesterId: "me", addresseeId: "pal", status: "PENDING" }]);
  });

  it("answers an already-pending or already-accepted email the same way, without a new row", async () => {
    await send(PAL.email);
    const again = await send(PAL.email);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true });
    expect(m.rows).toHaveLength(1);

    m.rows[0].status = "ACCEPTED";
    expect(await (await send(PAL.email)).json()).toEqual({ ok: true });
    expect(m.rows).toHaveLength(1);
  });

  it("doesn't create a reverse row when the target already asked me", async () => {
    m.rows.push({ id: "x", requesterId: "pal", addresseeId: "me", status: "PENDING" });
    expect((await send(PAL.email)).status).toBe(200);
    expect(m.rows).toHaveLength(1);
  });

  it("finds the account whatever the email's casing", async () => {
    expect((await send("  PAL@Example.TEST ")).status).toBe(200);
    expect(m.rows).toEqual([expect.objectContaining({ addresseeId: "pal" })]);
  });

  it("treats % and _ in the email literally, never as wildcards", async () => {
    expect((await send("%@example.test")).status).toBe(200);
    expect((await send("p_l@example.test")).status).toBe(200);
    expect(m.rows).toHaveLength(0);
    const { prisma } = await import("@/lib/db");
    expect(vi.mocked(prisma.$queryRaw).mock.calls.map((c) => c[1])).toEqual(["%@example.test", "p_l@example.test"]);
  });

  it("a double-send of a decline-lift answers neutrally, not 500", async () => {
    m.rows.push({ id: "d", requesterId: "pal", addresseeId: "me", status: "DECLINED" });
    const { prisma } = await import("@/lib/db");
    const { Prisma } = await import("@prisma/client");
    vi.mocked(prisma.userConnection.create).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }),
    );
    const res = await send(PAL.email);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("keeps 'that's you' as a 400, case-insensitively", async () => {
    const res = await send("  ME@example.test ");
    expect(res.status).toBe(400);
    expect(m.rows).toHaveLength(0);
  });

  it("rejects a missing or non-string email with 400", async () => {
    expect((await send("")).status).toBe(400);
    expect((await send(42)).status).toBe(400);
    expect((await send(undefined)).status).toBe(400);
  });

  it("requires sign-in", async () => {
    as(null);
    expect((await send(PAL.email)).status).toBe(401);
  });
});

describe("decline keeps a DECLINED row and blocks re-sends (F6)", () => {
  it("decline then re-send: no new request reaches the target", async () => {
    await send(PAL.email);

    as(PAL);
    const { pending } = await list();
    expect(pending).toHaveLength(1);
    expect((await decline(pending[0].id)).status).toBe(200);
    expect(m.rows).toEqual([expect.objectContaining({ status: "DECLINED" })]);

    as(ME);
    const resend = await send(PAL.email);
    expect(resend.status).toBe(200);
    expect(await resend.json()).toEqual({ ok: true });

    as(PAL);
    expect(await list()).toEqual({ friends: [], pending: [] });
    expect(m.rows).toHaveLength(1);
  });

  it("the requester can't delete a DECLINED row to start over", async () => {
    m.rows.push({ id: "d", requesterId: "me", addresseeId: "pal", status: "DECLINED" });
    expect((await decline("d")).status).toBe(404);
    expect(m.rows).toHaveLength(1);
  });

  it("a DECLINED row can't be accepted", async () => {
    m.rows.push({ id: "d", requesterId: "pal", addresseeId: "me", status: "DECLINED" });
    expect((await accept("d")).status).toBe(404);
    expect(m.rows[0].status).toBe("DECLINED");
  });

  it("DECLINED never shows up as a friend for either side", async () => {
    m.rows.push({ id: "d", requesterId: "me", addresseeId: "pal", status: "DECLINED" });
    expect(await list()).toEqual({ friends: [], pending: [] });
    as(PAL);
    expect(await list()).toEqual({ friends: [], pending: [] });
  });

  it("the person who declined can still reach out the other way", async () => {
    m.rows.push({ id: "d", requesterId: "pal", addresseeId: "me", status: "DECLINED" });
    expect((await send(PAL.email)).status).toBe(200);
    expect(m.rows).toEqual([expect.objectContaining({ requesterId: "me", addresseeId: "pal", status: "PENDING" })]);
  });

  it("the requester can cancel their own pending request (row deleted)", async () => {
    await send(PAL.email);
    expect((await decline("c1")).status).toBe(200);
    expect(m.rows).toHaveLength(0);
  });

  it("removing an accepted friend deletes the row", async () => {
    m.rows.push({ id: "a", requesterId: "pal", addresseeId: "me", status: "ACCEPTED" });
    expect((await decline("a")).status).toBe(200);
    expect(m.rows).toHaveLength(0);
  });

  it("strangers get 404 on someone else's connection", async () => {
    m.rows.push({ id: "p", requesterId: "pal", addresseeId: "other", status: "PENDING" });
    expect((await decline("p")).status).toBe(404);
    expect((await accept("p")).status).toBe(404);
    expect(m.rows[0].status).toBe("PENDING");
  });
});

describe("pending outgoing cap (F6)", () => {
  it(`allows ${MAX_PENDING_OUTGOING} pending requests and refuses the next with 429`, async () => {
    for (let i = 0; i < MAX_PENDING_OUTGOING; i++) {
      m.users.push({ id: `u${i}`, email: `u${i}@example.test`, name: `U${i}` });
      expect((await send(`u${i}@example.test`)).status).toBe(200);
    }
    expect(m.rows).toHaveLength(MAX_PENDING_OUTGOING);

    const over = await send(OTHER.email);
    expect(over.status).toBe(429);
    expect((await over.json()).error).toMatch(/waiting for an answer/);
    expect(m.rows).toHaveLength(MAX_PENDING_OUTGOING);

    // Same 429 for an unknown email: the direct response doesn't depend on the email.
    // (The count itself only moves for real accounts; see the PR's residual-risk note.)
    expect((await send("nobody@example.test")).status).toBe(429);
  });

  it("30 parallel sends can't exceed the cap", async () => {
    m.countDelay = true;
    for (let i = 0; i < 30; i++) m.users.push({ id: `u${i}`, email: `u${i}@example.test`, name: `U${i}` });
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => send(`u${i}@example.test`)));
    expect(m.rows.filter((r) => r.status === "PENDING")).toHaveLength(MAX_PENDING_OUTGOING);
    expect(results.filter((r) => r.status === 200)).toHaveLength(MAX_PENDING_OUTGOING);
    expect(results.filter((r) => r.status === 429)).toHaveLength(10);
  });

  it("accepted and declined requests don't count toward the cap", async () => {
    for (let i = 0; i < MAX_PENDING_OUTGOING; i++) {
      m.rows.push({ id: `r${i}`, requesterId: "me", addresseeId: `u${i}`, status: i % 2 ? "ACCEPTED" : "DECLINED" });
    }
    expect((await send(PAL.email)).status).toBe(200);
    expect(m.rows.filter((r) => r.status === "PENDING")).toHaveLength(1);
  });
});
