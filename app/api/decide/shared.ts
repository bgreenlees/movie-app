// Shared by the /api/decide routes (spec docs/specs/watch-together-decide.md
// §5.4, §5.6, §6). The pure decisions (rounds, matches, "pick for us") live in
// lib/decide.ts; this file loads rows, checks who may see them and shapes the
// responses.
//
// Authorization rule used everywhere: a session's two participants are the
// two people on its connection row (requesterId, addresseeId), and the
// connection must still be ACCEPTED. Nothing from the request decides who
// the participants are. Anyone else gets the same 404 as a missing id.

import { NextResponse } from "next/server";
import type { DecideStatus, Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decideMoodSchema, decideSessionIdSchema, type Vote } from "@/lib/decide";
import { DEFAULT_SELECTION, type MoodSelection } from "@/lib/moodPicker";

/** A session ends 6 h after it starts (§5.4). Checked when read; no job. */
export const SESSION_TTL_MS = 6 * 60 * 60 * 1000;
/** Sessions one person may start in any 24 h (§6, F1). */
export const DAILY_SESSION_LIMIT = 20;
export const DAY_MS = 24 * 60 * 60 * 1000;
/** Starting a session deletes the pair's sessions older than this (§5.4). */
export const CLEANUP_AFTER_MS = 30 * DAY_MS;
/** Fewer candidates than this and there's nothing worth voting on (§5.3). */
export const MIN_CANDIDATES = 4;

/** Statuses a session can be voted on or moved forward from. */
export const ACTIVE_STATUSES: DecideStatus[] = ["OPEN", "NO_MATCH"];

export type ViewStatus = DecideStatus | "EXPIRED";

// ── Responses ────────────────────────────────────────────────────────────────

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const unauthorized = () => json({ error: "Unauthorized" }, 401);
export const notFound = () => json({ error: "Not found" }, 404);
export const badRequest = (error = "Invalid request") => json({ error }, 400);
export const conflict = (error: string) => json({ error }, 409);
export const serverError = (what: string, error: unknown) => {
  // Message only: never log request bodies, ids of the other person or secrets.
  console.error(`Decide ${what} error:`, error instanceof Error ? error.message : "unknown");
  return json({ error: "Something went wrong" }, 500);
};

/** The signed-in user's id, or null. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

// ── Loading a session the caller may see ─────────────────────────────────────

type Db = Prisma.TransactionClient | typeof prisma;

const sessionInclude = {
  connection: { select: { requesterId: true, addresseeId: true, status: true } },
} as const;

export type LoadedSession = Prisma.DecideSessionGetPayload<{ include: typeof sessionInclude }>;

export interface SessionAccess {
  session: LoadedSession;
  myId: string;
  partnerId: string;
  /** The stored status, with OPEN / NO_MATCH past `expiresAt` shown as EXPIRED */
  status: ViewStatus;
}

/**
 * The session with this id if the caller is one of its two participants, or
 * null (a malformed id, no such session and someone else's session look the
 * same, so ids can't be probed).
 */
export async function loadSessionFor(
  rawId: string,
  myId: string,
  db: Db = prisma,
  now: Date = new Date(),
): Promise<SessionAccess | null> {
  const id = decideSessionIdSchema.safeParse(rawId);
  if (!id.success) return null;
  const session = await db.decideSession.findUnique({ where: { id: id.data }, include: sessionInclude });
  if (!session || session.connection.status !== "ACCEPTED") return null;
  const { requesterId, addresseeId } = session.connection;
  if (myId !== requesterId && myId !== addresseeId) return null;
  return {
    session,
    myId,
    partnerId: myId === requesterId ? addresseeId : requesterId,
    status: viewStatus(session, now),
  };
}

/** Lazy expiry (§5.4): an unfinished session past its deadline has ended. */
export function viewStatus(s: { status: DecideStatus; expiresAt: Date }, now: Date): ViewStatus {
  return ACTIVE_STATUSES.includes(s.status) && s.expiresAt.getTime() <= now.getTime() ? "EXPIRED" : s.status;
}

// ── Votes ────────────────────────────────────────────────────────────────────

/** Split vote rows into the two participants' maps; anyone else's are dropped. */
export function votesByPerson(
  rows: readonly { candidateId: string; userId: string; vote: number }[],
  aId: string,
  bId: string,
): { a: Record<string, Vote>; b: Record<string, Vote> } {
  const a: Record<string, Vote> = {};
  const b: Record<string, Vote> = {};
  for (const r of rows) {
    if (r.vote !== 0 && r.vote !== 1 && r.vote !== 2) continue; // never trust stored ints
    if (r.userId === aId) a[r.candidateId] = r.vote;
    else if (r.userId === bId) b[r.candidateId] = r.vote;
  }
  return { a, b };
}

// ── Candidate snapshots ──────────────────────────────────────────────────────

/** What `DecideCandidate.snapshot` holds (§5.4). Written by `POST /api/decide`. */
export interface CandidateSnapshot {
  title: string;
  posterPath: string | null;
  date: string;
  runtime: number | null;
  providerIds: number[];
  /** Why it's here, worded for the person who started the session */
  reason: string;
  /** The same, worded for the other person */
  partnerReason: string;
}

export interface CandidateView {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  posterPath: string | null;
  date: string;
  runtime: number | null;
  providerIds: number[];
  reason: string;
}

type CandidateRow = {
  id: string;
  mediaType: "MOVIE" | "TV";
  tmdbId: number;
  snapshot: Prisma.JsonValue;
};

/** A candidate as the viewer sees it: their own reason wording, nothing else. */
export function candidateView(row: CandidateRow, viewerIsCreator: boolean): CandidateView {
  const s = (row.snapshot && typeof row.snapshot === "object" && !Array.isArray(row.snapshot)
    ? row.snapshot
    : {}) as Partial<Record<keyof CandidateSnapshot, unknown>>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    id: row.id,
    mediaType: row.mediaType === "MOVIE" ? "movie" : "tv",
    tmdbId: row.tmdbId,
    title: str(s.title),
    posterPath: typeof s.posterPath === "string" ? s.posterPath : null,
    date: str(s.date),
    runtime: typeof s.runtime === "number" ? s.runtime : null,
    providerIds: Array.isArray(s.providerIds) ? s.providerIds.filter((n): n is number => typeof n === "number") : [],
    reason: str(viewerIsCreator ? s.reason : s.partnerReason) || str(s.reason),
  };
}

/** The stored mood, re-validated on the way out; junk falls back to defaults. */
export function storedMood(mood: Prisma.JsonValue): MoodSelection {
  const parsed = decideMoodSchema.safeParse(mood);
  return parsed.success ? parsed.data : { ...DEFAULT_SELECTION, media: "both" };
}

// ── Serializable transactions ────────────────────────────────────────────────

/** Thrown inside a transaction to roll it back and answer with this response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
  response() {
    return json({ error: this.message }, this.status);
  }
}

/**
 * Failures where nothing was committed, so running the transaction again is
 * safe: P2034 is a Postgres serialization conflict, P2028 an interactive
 * transaction that timed out or couldn't start (seen on dev when Neon was slow).
 */
function isRetryable(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2034" || code === "P2028";
}

/**
 * Prisma's defaults (2 s to start, 5 s to finish) are tight for a handful of
 * round trips to a remote database that may be waking up. A vote is small,
 * so a longer limit costs nothing in the normal case.
 */
export const TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable",
  maxWait: 5_000,
  timeout: 15_000,
} as const;

/**
 * Run `fn` in a Serializable transaction, retried once on a serialization
 * conflict or timeout (§5.6 Concurrency). Both people casting their last vote
 * at the same moment then resolve the round exactly once. The work inside is
 * re-read and re-decided on the retry, so retrying is safe.
 */
export async function serializable<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, TRANSACTION_OPTIONS);
    } catch (error) {
      if (attempt === 0 && isRetryable(error)) continue;
      throw error;
    }
  }
}
