// Route tests for /api/decide/** with an in-memory fake of Prisma
// (fakeDb.testutil.ts). No database, no network: the pair pool is faked too.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { FakeDb } from "./fakeDb.testutil";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  buildPairPool: vi.fn(),
}));

vi.mock("@/lib/db", async () => ({ prisma: (await import("./fakeDb.testutil")).createFakeDb() }));
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/pairPool", () => ({ buildPairPool: m.buildPairPool }));
vi.mock("@/lib/pairPoolLoader", () => ({
  loadPoolPerson: async (id: string) => ({
    name: id === "me1" ? "Alex" : id === "pal1" ? "Sam" : null,
    person: { entries: [], providerIds: [] },
  }),
  createPoolFetchers: () => ({}),
  warnPoolFetchFailed: () => {},
}));
// The Vitest setup has no "@/" alias, so the real pure modules are mapped here.
vi.mock("@/lib/connections", () => import("../../../lib/connections"));
vi.mock("@/lib/decide", () => import("../../../lib/decide"));
vi.mock("@/lib/moodPicker", () => import("../../../lib/moodPicker"));

import { prisma } from "@/lib/db";
import { GET as findOpen, POST as start } from "./route";
import { DELETE as cancel, GET as read } from "./[id]/route";
import { PUT as castVote } from "./[id]/votes/route";
import { POST as nextRound } from "./[id]/next-round/route";
import { POST as pick } from "./[id]/pick/route";

const db = prisma as unknown as FakeDb;
const HOUR = 60 * 60 * 1000;
const MOOD = { vibe: "any", time: "any", fresh: false, onMyServices: false };

const as = (userId: string | null) => m.auth.mockResolvedValue(userId ? { user: { id: userId } } : null);

const req = (url: string, init?: { method?: string; body?: unknown; raw?: string }) =>
  new NextRequest(`http://localhost${url}`, {
    method: init?.method ?? "GET",
    ...(init?.raw !== undefined
      ? { body: init.raw }
      : init?.body !== undefined
        ? { body: JSON.stringify(init.body) }
        : {}),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

/** A fake ranked pool of `n` titles, movies and TV alternating by id. */
function pool(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    mediaType: i % 2 ? "tv" : "movie",
    title: `Title ${i}`,
    posterPath: `/p${i}.jpg`,
    date: "2021-01-01",
    overview: "",
    popularity: 1,
    voteAverage: 7,
    pairScore: Math.round(((n - i) / n) * 1000) / 1000,
    reason: i === 0 ? "On Sam's list" : "Popular right now",
    partnerReason: i === 0 ? "On your list" : "Popular right now",
    onMyList: false,
    providerIds: [8],
  }));
}

function poolResult(n: number, over: Record<string, unknown> = {}) {
  return {
    pool: pool(n),
    services: { mine: false, partners: false, shared: [] },
    coldStart: { me: true, partner: true },
    discoverFailed: false,
    partial: false,
    ...over,
  };
}

async function startSession(by = "me1", partnerId = by === "me1" ? "pal1" : "me1") {
  as(by);
  const res = await start(req("/api/decide", { method: "POST", body: { partnerId, mood: MOOD } }));
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
}

const roundCandidates = (sessionId: string, round = 1) =>
  db.store.candidates
    .filter((c) => c.sessionId === sessionId && c.round === round)
    .sort((a, b) => (a.position as number) - (b.position as number))
    .map((c) => c.id as string);

async function vote(userId: string, sessionId: string, candidateId: string, v: unknown) {
  as(userId);
  return castVote(req(`/api/decide/${sessionId}/votes`, { method: "PUT", body: { candidateId, vote: v } }), ctx(sessionId));
}

/** Every card in the round gets these votes from this person; returns the last response. */
async function voteAll(userId: string, sessionId: string, pickVote: (i: number) => number, round = 1) {
  let res: Response | undefined;
  const ids = roundCandidates(sessionId, round);
  for (const [i, id] of ids.entries()) res = await vote(userId, sessionId, id, pickVote(i));
  return res!;
}

async function view(userId: string, sessionId: string) {
  as(userId);
  const res = await read(req(`/api/decide/${sessionId}`), ctx(sessionId));
  return { status: res.status, body: res.status === 200 ? await res.json() : null };
}

const session = (id: string) => db.store.sessions.find((s) => s.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  db.reset();
  db.store.users.push({ id: "me1", name: "Alex" }, { id: "pal1", name: "Sam" }, { id: "eve1", name: "Eve" }, { id: "pen1", name: "Pen" });
  db.store.connections.push(
    { id: "conn1", requesterId: "me1", addresseeId: "pal1", status: "ACCEPTED" },
    { id: "conn2", requesterId: "eve1", addresseeId: "pen1", status: "ACCEPTED" },
    { id: "conn3", requesterId: "pen1", addresseeId: "me1", status: "PENDING" },
  );
  m.buildPairPool.mockResolvedValue(poolResult(30));
});

// ── POST /api/decide ─────────────────────────────────────────────────────────

describe("POST /api/decide", () => {
  it("returns 401 with no session", async () => {
    as(null);
    const res = await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: MOOD } }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for bad JSON, a bad mood or a bad partner id", async () => {
    as("me1");
    expect((await start(req("/api/decide", { method: "POST", raw: "{" }))).status).toBe(400);
    expect(
      (await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: { ...MOOD, vibe: "sad" } } })))
        .status,
    ).toBe(400);
    expect((await start(req("/api/decide", { method: "POST", body: { partnerId: "../x", mood: MOOD } }))).status).toBe(400);
    expect(m.buildPairPool).not.toHaveBeenCalled();
  });

  it("returns 404 for a stranger, a pending connection and yourself", async () => {
    as("me1");
    for (const partnerId of ["eve1", "pen1", "me1", "nobody1"]) {
      const res = await start(req("/api/decide", { method: "POST", body: { partnerId, mood: MOOD } }));
      expect(res.status).toBe(404);
    }
    expect(m.buildPairPool).not.toHaveBeenCalled();
    expect(db.store.sessions).toHaveLength(0);
  });

  it("freezes the top 30 as 3 rounds of 10 with both people's reasons", async () => {
    const id = await startSession();
    const s = session(id);
    expect(s).toMatchObject({ connectionId: "conn1", createdById: "me1", status: "OPEN", round: 1 });
    expect((s.expiresAt as Date).getTime() - (s.createdAt as Date).getTime()).toBeLessThanOrEqual(6 * HOUR + 1000);
    expect(s.mood).toEqual({ ...MOOD, media: "both" });
    expect([1, 2, 3].map((r) => roundCandidates(id, r).length)).toEqual([10, 10, 10]);
    const first = db.store.candidates.find((c) => c.sessionId === id && c.round === 1 && c.position === 0)!;
    expect(first).toMatchObject({ mediaType: "MOVIE", tmdbId: 100, score: 1 });
    expect(first.snapshot).toMatchObject({ reason: "On Sam's list", partnerReason: "On your list", providerIds: [8] });
    expect(m.buildPairPool.mock.calls[0][0]).toMatchObject({ partnerName: "Sam", partnerView: { myName: "Alex" } });
  });

  it("cancels the pair's earlier open session", async () => {
    const first = await startSession();
    const second = await startSession("pal1");
    expect(session(first).status).toBe("CANCELLED");
    expect(session(second).status).toBe("OPEN");
  });

  it("returns 422 with fewer than 4 candidates and 502 when TMDB is down", async () => {
    as("me1");
    m.buildPairPool.mockResolvedValueOnce(poolResult(3));
    expect((await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: MOOD } }))).status).toBe(422);
    m.buildPairPool.mockResolvedValueOnce(poolResult(0, { discoverFailed: true }));
    expect((await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: MOOD } }))).status).toBe(502);
    expect(db.store.sessions).toHaveLength(0);
  });

  it("returns 429 for the 21st session in 24 h, before any TMDB work", async () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      db.store.sessions.push({
        id: `old${i}`, connectionId: "conn1", createdById: "me1", status: "CANCELLED", round: 1,
        mood: MOOD, createdAt: new Date(now - (23 * HOUR) + i), expiresAt: new Date(now),
      });
    }
    as("me1");
    const res = await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: MOOD } }));
    expect(res.status).toBe(429);
    expect(m.buildPairPool).not.toHaveBeenCalled();

    // The partner has their own allowance.
    await startSession("pal1");
  });

  it("allows a new session once the oldest of the 20 is over 24 h old, and cleans up after 30 days", async () => {
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      db.store.sessions.push({
        id: `old${i}`, connectionId: "conn1", createdById: "me1", status: "MATCHED", round: 1, mood: MOOD,
        createdAt: new Date(i === 0 ? now - 31 * 24 * HOUR : now - HOUR), expiresAt: new Date(now),
      });
    }
    db.store.candidates.push({ id: "oldc", sessionId: "old0", round: 1, position: 0, score: 1 });
    await startSession();
    expect(db.store.sessions.some((s) => s.id === "old0")).toBe(false);
    expect(db.store.candidates.some((c) => c.id === "oldc")).toBe(false);
    expect(db.store.sessions.some((s) => s.id === "old1")).toBe(true);
  });

  it("re-checks the cap inside the transaction (two starts racing)", async () => {
    const now = Date.now();
    for (let i = 0; i < 19; i++) {
      db.store.sessions.push({
        id: `old${i}`, connectionId: "conn1", createdById: "me1", status: "CANCELLED", round: 1,
        mood: MOOD, createdAt: new Date(now - HOUR), expiresAt: new Date(now),
      });
    }
    // Another request lands its session while this one is building the pool.
    m.buildPairPool.mockImplementationOnce(async () => {
      db.store.sessions.push({
        id: "racer", connectionId: "conn1", createdById: "me1", status: "OPEN", round: 1,
        mood: MOOD, createdAt: new Date(), expiresAt: new Date(now + HOUR),
      });
      return poolResult(30);
    });
    as("me1");
    const res = await start(req("/api/decide", { method: "POST", body: { partnerId: "pal1", mood: MOOD } }));
    expect(res.status).toBe(429);
    expect(session("racer").status).toBe("OPEN");
  });
});

// ── GET /api/decide?partnerId= ───────────────────────────────────────────────

describe("GET /api/decide?partnerId=", () => {
  const lookup = (userId: string, partnerId: string) => {
    as(userId);
    return findOpen(req(`/api/decide?partnerId=${partnerId}`));
  };

  it("shows the open session to both people, as me or partner", async () => {
    const id = await startSession();
    expect((await (await lookup("me1", "pal1")).json()).session).toMatchObject({ id, createdBy: "me" });
    expect((await (await lookup("pal1", "me1")).json()).session).toMatchObject({ id, createdBy: "partner" });
  });

  it("returns null once the session has expired or ended", async () => {
    const id = await startSession();
    session(id).expiresAt = new Date(Date.now() - 1);
    expect((await (await lookup("me1", "pal1")).json()).session).toBeNull();
  });

  it("returns 404 when not connected or the id is malformed", async () => {
    expect((await lookup("me1", "eve1")).status).toBe(404);
    expect((await lookup("me1", "pen1")).status).toBe(404);
    expect((await lookup("me1", "")).status).toBe(404);
  });
});

// ── GET /api/decide/[id] ─────────────────────────────────────────────────────

describe("GET /api/decide/[id]", () => {
  it("returns 401 with no session and 404 to anyone outside the pair", async () => {
    const id = await startSession();
    as(null);
    expect((await read(req(`/api/decide/${id}`), ctx(id))).status).toBe(401);
    expect((await view("eve1", id)).status).toBe(404);
    expect((await view("pen1", id)).status).toBe(404);
    expect((await view("me1", "no-such-id")).status).toBe(404);
    expect((await view("me1", "s".repeat(41))).status).toBe(404);
  });

  it("returns 404 once the pair is no longer connected", async () => {
    const id = await startSession();
    db.store.connections[0].status = "PENDING";
    expect((await view("me1", id)).status).toBe(404);
  });

  it("shows a show Sam is watching as Sam's, and the same card to Sam as his own", async () => {
    const result = poolResult(30);
    result.pool[0] = {
      ...result.pool[0],
      mediaType: "tv",
      reason: "Sam is watching this",
      partnerReason: "You're watching this",
      onMyList: false,
    };
    m.buildPairPool.mockResolvedValueOnce(result);
    const id = await startSession();
    expect((await view("me1", id)).body.candidates[0]).toMatchObject({ mediaType: "tv", reason: "Sam is watching this" });
    expect((await view("pal1", id)).body.candidates[0]).toMatchObject({ mediaType: "tv", reason: "You're watching this" });
  });

  it("shows the current round with each person's own reason wording", async () => {
    const id = await startSession();
    const mine = (await view("me1", id)).body;
    const theirs = (await view("pal1", id)).body;
    expect(mine).toMatchObject({ status: "OPEN", round: 1, maxRound: 3, partner: { id: "pal1", name: "Sam" } });
    expect(theirs.partner).toEqual({ id: "me1", name: "Alex" });
    expect(mine.candidates).toHaveLength(10);
    expect(mine.candidates[0]).toMatchObject({ mediaType: "movie", tmdbId: 100, reason: "On Sam's list" });
    expect(theirs.candidates[0].reason).toBe("On your list");
    expect(mine.mood).toEqual({ ...MOOD, media: "both" });
    expect(JSON.stringify(mine)).not.toMatch(/email|partnerReason|score/i);
  });

  it("never includes the partner's votes, only a count", async () => {
    const id = await startSession();
    const [c0, c1, c2] = roundCandidates(id);
    await vote("me1", id, c0, 2);
    await vote("pal1", id, c0, 0);
    await vote("pal1", id, c1, 1);
    await vote("pal1", id, c2, 2);

    const mine = (await view("me1", id)).body;
    expect(mine.myVotes).toEqual({ [c0]: 2 });
    expect(mine.partnerProgress).toEqual({ voted: 3, total: 10 });
    expect(mine.result).toBeUndefined();
    // Nothing else in the body carries the partner's choices.
    expect(Object.keys(mine).sort()).toEqual(
      ["candidates", "id", "maxRound", "mood", "myVotes", "partner", "partnerProgress", "round", "status"].sort(),
    );
    // The partner's cards appear only as plain candidates, with no vote attached.
    expect(JSON.stringify({ ...mine, candidates: undefined })).not.toContain(c1);
    expect(mine.candidates.every((c: object) => !("vote" in c))).toBe(true);

    const theirs = (await view("pal1", id)).body;
    expect(theirs.myVotes).toEqual({ [c0]: 0, [c1]: 1, [c2]: 2 });
    expect(theirs.partnerProgress).toEqual({ voted: 1, total: 10 });
  });

  it("shows EXPIRED for an unfinished session past 6 h", async () => {
    const id = await startSession();
    session(id).expiresAt = new Date(Date.now() - 1);
    expect((await view("me1", id)).body.status).toBe("EXPIRED");
  });
});

// ── PUT /api/decide/[id]/votes ───────────────────────────────────────────────

describe("PUT /api/decide/[id]/votes", () => {
  it("returns 401, 400 and 404 for the basics", async () => {
    const id = await startSession();
    const [c0] = roundCandidates(id);
    as(null);
    expect((await castVote(req(`/api/decide/${id}/votes`, { method: "PUT", body: { candidateId: c0, vote: 1 } }), ctx(id))).status).toBe(401);
    expect((await vote("me1", id, c0, 3)).status).toBe(400);
    expect((await vote("me1", id, c0, "1")).status).toBe(400);
    expect((await vote("me1", id, "../x", 1)).status).toBe(400);
    as("me1");
    expect((await castVote(req(`/api/decide/${id}/votes`, { method: "PUT", raw: "nope" }), ctx(id))).status).toBe(400);
    expect((await vote("eve1", id, c0, 1)).status).toBe(404);
    expect(db.store.votes).toHaveLength(0);
  });

  it("returns 404 for a candidate from another session", async () => {
    const mine = await startSession();
    // Eve and Pen's own session
    const theirs = await startSession("eve1", "pen1");
    const foreign = roundCandidates(theirs)[0];
    expect((await vote("me1", mine, foreign, 1)).status).toBe(404);
    // ...and Eve can't vote in ours with her own candidate either
    expect((await vote("eve1", mine, foreign, 1)).status).toBe(404);
    expect(db.store.votes).toHaveLength(0);
  });

  it("returns 409 for a candidate held for a later round", async () => {
    const id = await startSession();
    const later = roundCandidates(id, 2)[0];
    expect((await vote("me1", id, later, 1)).status).toBe(409);
  });

  it("changes a vote instead of adding a second one", async () => {
    const id = await startSession();
    const [c0] = roundCandidates(id);
    await vote("me1", id, c0, 0);
    await vote("me1", id, c0, 2);
    expect(db.store.votes).toHaveLength(1);
    expect(db.store.votes[0]).toMatchObject({ sessionId: id, candidateId: c0, userId: "me1", vote: 2 });
  });

  it("resolves a match once both have voted on every card, then refuses more votes", async () => {
    const id = await startSession();
    const ids = roundCandidates(id);
    // Both like card 3; only one likes card 1; card 5 is Yes + Really want.
    const mineVotes = (i: number) => (i === 3 ? 2 : i === 1 ? 2 : i === 5 ? 1 : 0);
    const theirVotes = (i: number) => (i === 3 ? 2 : i === 5 ? 2 : 0);

    const half = await voteAll("me1", id, mineVotes);
    expect(await half.json()).toEqual({ status: "OPEN" });
    const last = await voteAll("pal1", id, theirVotes);
    expect(last.status).toBe(200);
    expect(await last.json()).toEqual({ status: "MATCHED" });
    expect(session(id)).toMatchObject({ status: "MATCHED", winnerId: ids[3] });
    expect(session(id).resolvedAt).toBeInstanceOf(Date);

    const { body } = await view("pal1", id);
    expect(body.status).toBe("MATCHED");
    expect(body.result.winner).toMatchObject({ id: ids[3], tmdbId: 103 });
    expect(body.result.alsoMatched.map((c: { id: string }) => c.id)).toEqual([ids[5]]);
    expect(body.result).toMatchObject({ bothReallyWant: true, picked: false });
    // Card 1 (only one Yes) isn't revealed.
    expect(JSON.stringify(body.result)).not.toContain(ids[1]);

    expect((await vote("me1", id, ids[0], 1)).status).toBe(409);
  });

  it("returns 409 after the session expires or is cancelled", async () => {
    const id = await startSession();
    const [c0] = roundCandidates(id);
    session(id).expiresAt = new Date(Date.now() - 1);
    expect((await vote("me1", id, c0, 1)).status).toBe(409);

    const other = await startSession();
    as("pal1");
    expect((await (await cancel(req(`/api/decide/${other}`, { method: "DELETE" }), ctx(other))).json()).status).toBe("CANCELLED");
    expect((await vote("me1", other, roundCandidates(other)[0], 1)).status).toBe(409);
  });

  it("runs in a Serializable transaction and retries once on a conflict", async () => {
    const id = await startSession();
    const [c0] = roundCandidates(id);
    const real = db.$transaction;
    const spy = vi
      .spyOn(db, "$transaction")
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error("write conflict"), { code: "P2034" });
      })
      .mockImplementation(real);
    expect((await vote("me1", id, c0, 1)).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][1]).toMatchObject({ isolationLevel: "Serializable" });
    expect(db.store.votes).toHaveLength(1);
    spy.mockRestore();
  });

  it("retries once when the transaction timed out (P2028)", async () => {
    const id = await startSession();
    const [c0] = roundCandidates(id);
    const real = db.$transaction;
    const spy = vi
      .spyOn(db, "$transaction")
      .mockImplementationOnce(async () => {
        throw Object.assign(new Error("Transaction not found"), { code: "P2028" });
      })
      .mockImplementation(real);
    expect((await vote("me1", id, c0, 1)).status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("gives up after a second conflict with a 500, saving nothing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await startSession();
    const [c0] = roundCandidates(id);
    const spy = vi.spyOn(db, "$transaction").mockImplementation(async () => {
      throw Object.assign(new Error("write conflict"), { code: "P2034" });
    });
    expect((await vote("me1", id, c0, 1)).status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});

// ── No match → next round / pick for us ──────────────────────────────────────

describe("no match", () => {
  async function noMatchSession() {
    const id = await startSession();
    await voteAll("me1", id, (i) => (i < 5 ? 1 : 0));
    const res = await voteAll("pal1", id, (i) => (i < 5 ? 0 : 1));
    expect(await res.json()).toEqual({ status: "NO_MATCH" });
    return id;
  }
  const post = (handler: typeof nextRound, userId: string, id: string) => {
    as(userId);
    return handler(req(`/api/decide/${id}/x`, { method: "POST" }), ctx(id));
  };

  it("next-round moves to round 2 with the next 10, and old-round votes are refused", async () => {
    const id = await noMatchSession();
    const oldCard = roundCandidates(id)[0];
    const res = await post(nextRound, "pal1", id);
    expect(await res.json()).toEqual({ status: "OPEN", round: 2 });
    const { body } = await view("me1", id);
    expect(body.round).toBe(2);
    expect(body.candidates.map((c: { id: string }) => c.id)).toEqual(roundCandidates(id, 2));
    expect(body.myVotes).toEqual({});
    expect((await vote("me1", id, oldCard, 1)).status).toBe(409);
    // A second "Try 10 more" (the other phone) conflicts rather than skipping a round.
    expect((await post(nextRound, "me1", id)).status).toBe(409);
  });

  it("next-round and pick return 409 while voting is open, and 404 to outsiders", async () => {
    const id = await startSession();
    expect((await post(nextRound, "me1", id)).status).toBe(409);
    expect((await post(pick, "me1", id)).status).toBe(409);
    const ended = await noMatchSession();
    expect((await post(nextRound, "eve1", ended)).status).toBe(404);
    expect((await post(pick, "eve1", ended)).status).toBe(404);
  });

  it("next-round returns 409 after round 3, or when no titles are held", async () => {
    const id = await noMatchSession();
    session(id).round = 3;
    expect((await post(nextRound, "me1", id)).status).toBe(409);

    m.buildPairPool.mockResolvedValueOnce(poolResult(8));
    const small = await startSession();
    await voteAll("me1", small, () => 0);
    await voteAll("pal1", small, () => 0);
    expect(session(small).status).toBe("NO_MATCH");
    expect((await post(nextRound, "me1", small)).status).toBe(409);
  });

  it("pick chooses the best-scored title nobody said No to", async () => {
    const id = await noMatchSession();
    const ids = roundCandidates(id);
    const res = await post(pick, "me1", id);
    expect(await res.json()).toEqual({ status: "PICKED" });
    // Every round-1 card got a No from someone, so the best held one (round 2, first) wins.
    expect(session(id).winnerId).toBe(roundCandidates(id, 2)[0]);
    const { body } = await view("pal1", id);
    expect(body.status).toBe("PICKED");
    expect(body.result).toMatchObject({ picked: true, bothReallyWant: false, alsoMatched: [] });
    expect(body.result.winner.id).toBe(roundCandidates(id, 2)[0]);
    expect(ids).not.toContain(body.result.winner.id);
    expect((await post(pick, "me1", id)).status).toBe(409);
  });

  it("next-round and pick return 409 on an expired session", async () => {
    const id = await noMatchSession();
    session(id).expiresAt = new Date(Date.now() - 1);
    expect((await post(nextRound, "me1", id)).status).toBe(409);
    expect((await post(pick, "me1", id)).status).toBe(409);
  });
});

// ── DELETE /api/decide/[id] ──────────────────────────────────────────────────

describe("DELETE /api/decide/[id]", () => {
  const del = (userId: string, id: string) => {
    as(userId);
    return cancel(req(`/api/decide/${id}`, { method: "DELETE" }), ctx(id));
  };

  it("lets either person cancel, and nobody else", async () => {
    const id = await startSession();
    expect((await del("eve1", id)).status).toBe(404);
    expect(session(id).status).toBe("OPEN");
    expect(await (await del("pal1", id)).json()).toEqual({ status: "CANCELLED" });
    expect(session(id).status).toBe("CANCELLED");
  });

  it("leaves a matched session alone", async () => {
    const id = await startSession();
    await voteAll("me1", id, () => 1);
    await voteAll("pal1", id, () => 1);
    expect(await (await del("me1", id)).json()).toEqual({ status: "MATCHED" });
    expect(session(id).status).toBe("MATCHED");
  });
});
