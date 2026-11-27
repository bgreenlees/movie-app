import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  send: vi.fn(),
  invites: [] as { id: string; inviterId: string; email: string; sentAt: Date | null; acceptedAt: Date | null; createdAt?: Date | null }[],
  conns: [] as { requesterId: string; addresseeId: string }[],
  raw: [] as { id: string; inviter_id: string }[],
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: m.send };
  },
}));
vi.mock("./db", () => {
  const byKey = (w: { inviterId_email: { inviterId: string; email: string } }) =>
    m.invites.find((i) => i.inviterId === w.inviterId_email.inviterId && i.email === w.inviterId_email.email);
  const connectionInvite = {
    findUnique: vi.fn(async ({ where }) => byKey(where) ?? null),
    upsert: vi.fn(async ({ where, create, update }) => {
      const hit = byKey(where);
      if (hit) return Object.assign(hit, update);
      const row = { id: `i${m.invites.length + 1}`, sentAt: null, acceptedAt: null, createdAt: create.sentAt, ...create };
      m.invites.push(row);
      return row;
    }),
    count: vi.fn(async ({ where }) =>
      m.invites.filter((i) => i.inviterId === where.inviterId && i.createdAt && i.createdAt >= where.createdAt.gte).length,
    ),
    update: vi.fn(async ({ where, data }) => {
      const hit = where.id ? m.invites.find((i) => i.id === where.id) : byKey(where);
      return Object.assign(hit!, data);
    }),
  };
  const userConnection = {
    findFirst: vi.fn(async ({ where }) =>
      m.conns.find((c) => where.OR.some((w: typeof c) => w.requesterId === c.requesterId && w.addresseeId === c.addresseeId)) ?? null,
    ),
    create: vi.fn(async ({ data }) => m.conns.push(data)),
  };
  const tx = { connectionInvite, userConnection, $executeRaw: vi.fn() };
  return {
    prisma: {
      ...tx,
      $queryRaw: vi.fn(async () => m.raw),
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});

import { buildInviteEmail, convertInvites, deliverInvite, MAX_INVITES_PER_DAY, recordInvite, RESEND_COOLDOWN_MS } from "./invites";
import { isValidEmail, normalizeEmail } from "./emailAddress";

beforeEach(() => {
  m.send.mockReset().mockResolvedValue({ error: null });
  m.invites = [];
  m.conns = [];
  m.raw = [];
  process.env.EMAIL_FROM = "Test <invites@example.test>";
  process.env.RESEND_API_KEY = "re_test";
});

describe("email helpers", () => {
  it("normalises and validates", () => {
    expect(normalizeEmail("  Bob@Example.TEST ")).toBe("bob@example.test");
    expect(isValidEmail("a@b.co")).toBe(true);
    for (const bad of ["a", "a@b", "a b@c.de", "@b.de", "a@@b.de"]) expect(isValidEmail(bad)).toBe(false);
    expect(isValidEmail("a".repeat(250) + "@b.de")).toBe(false);
  });
  it("escapes the inviter's name in HTML but not in text", () => {
    const { html, text } = buildInviteEmail(`<img src=x onerror=alert(1)> & "Bob"`);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&amp;");
    expect(text).toContain("<img");
  });
});

/** What the route does: record in the request, deliver afterwards. */
async function createInvite(email: string, inviterId: string, name: string, now: Date) {
  const claim = await recordInvite(email, inviterId, now);
  if (claim) await deliverInvite(email, inviterId, name, claim);
}

describe("createInvite", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  it("recordInvite only touches the DB: it never calls the email sender", async () => {
    m.send.mockReturnValue(new Promise(() => {})); // would hang forever if awaited
    const claim = await recordInvite("new@example.test", "u1", now);
    expect(claim).toEqual({ previousSentAt: null });
    expect(m.invites).toHaveLength(1);
    expect(m.send).not.toHaveBeenCalled();
  });
  it("keeps the inviter's name out of the subject", () => {
    expect(buildInviteEmail("Ann Example").subject).not.toContain("Ann");
  });
  it("silently skips once the inviter has created 10 invites in 24h, and allows it again later", async () => {
    for (let i = 0; i < MAX_INVITES_PER_DAY; i++) {
      expect(await recordInvite(`p${i}@example.test`, "u1", now)).not.toBeNull();
    }
    expect(await recordInvite("extra@example.test", "u1", now)).toBeNull();
    expect(m.invites).toHaveLength(MAX_INVITES_PER_DAY);
    expect(await recordInvite("other@example.test", "u2", now)).not.toBeNull(); // per inviter
    const later = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 1000);
    expect(await recordInvite("extra@example.test", "u1", later)).not.toBeNull();
  });
  it("records and emails a new invite", async () => {
    await createInvite("new@example.test", "u1", "Ann", now);
    expect(m.invites).toHaveLength(1);
    expect(m.invites[0].sentAt).toEqual(now);
    expect(m.send).toHaveBeenCalledOnce();
    expect(m.send.mock.calls[0][0]).toMatchObject({ to: "new@example.test", from: "Test <invites@example.test>" });
  });
  it("does not re-send to the same email within 7 days, but does after", async () => {
    await createInvite("new@example.test", "u1", "Ann", now);
    await createInvite("new@example.test", "u1", "Ann", new Date(now.getTime() + RESEND_COOLDOWN_MS - 1000));
    expect(m.send).toHaveBeenCalledOnce();
    expect(m.invites).toHaveLength(1);
    await createInvite("new@example.test", "u1", "Ann", new Date(now.getTime() + RESEND_COOLDOWN_MS + 1000));
    expect(m.send).toHaveBeenCalledTimes(2);
  });
  it("records but doesn't send without EMAIL_FROM", async () => {
    delete process.env.EMAIL_FROM;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createInvite("new@example.test", "u1", "Ann", now);
    expect(m.invites).toHaveLength(1);
    expect(m.invites[0].sentAt).toBeNull();
    expect(m.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
  it("rolls the claim back if Resend fails, so a retry can send", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.send.mockResolvedValueOnce({ error: { message: "boom" } });
    await createInvite("new@example.test", "u1", "Ann", now);
    expect(m.invites[0].sentAt).toBeNull();
    await createInvite("new@example.test", "u1", "Ann", now);
    expect(m.send).toHaveBeenCalledTimes(2);
  });
});

describe("convertInvites", () => {
  it("creates a PENDING request from the inviter and is idempotent", async () => {
    m.invites = [{ id: "i1", inviterId: "u1", email: "new@example.test", sentAt: null, acceptedAt: null }];
    m.raw = [{ id: "i1", inviter_id: "u1" }];
    await convertInvites("u2", "New@Example.test");
    expect(m.conns).toEqual([{ requesterId: "u1", addresseeId: "u2" }]);
    expect(m.invites[0].acceptedAt).not.toBeNull();
    m.raw = []; // the SQL filters out accepted invites
    await convertInvites("u2", "new@example.test");
    expect(m.conns).toHaveLength(1);
  });
  it("doesn't duplicate an existing connection", async () => {
    m.invites = [{ id: "i1", inviterId: "u1", email: "x@example.test", sentAt: null, acceptedAt: null }];
    m.raw = [{ id: "i1", inviter_id: "u1" }];
    m.conns = [{ requesterId: "u2", addresseeId: "u1" }];
    await convertInvites("u2", "x@example.test");
    expect(m.conns).toHaveLength(1);
    expect(m.invites[0].acceptedAt).not.toBeNull();
  });
  it("one failing invite doesn't stop the others", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.invites = [
      { id: "i1", inviterId: "u1", email: "x@example.test", sentAt: null, acceptedAt: null },
      { id: "i2", inviterId: "u3", email: "x@example.test", sentAt: null, acceptedAt: null },
    ];
    m.raw = [{ id: "i1", inviter_id: "u1" }, { id: "i2", inviter_id: "u3" }];
    const { prisma } = await import("./db");
    vi.mocked(prisma.userConnection.create).mockRejectedValueOnce(new Error("P2002"));
    await convertInvites("u2", "x@example.test");
    expect(m.conns).toEqual([{ requesterId: "u3", addresseeId: "u2" }]);
    expect(m.invites[1].acceptedAt).not.toBeNull();
  });
  it("never throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    m.raw = [{ id: "missing", inviter_id: "u1" }];
    await expect(convertInvites("u2", "x@example.test")).resolves.toBeUndefined();
  });
});
