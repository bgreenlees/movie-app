import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireConnection } from "@/lib/connections";
import { decideQuerySchema, splitIntoRounds, startDecideBodySchema, MAX_ROUNDS, ROUND_SIZE } from "@/lib/decide";
import { buildPairPool } from "@/lib/pairPool";
import { createPoolFetchers, loadPoolPerson, warnPoolFetchFailed } from "@/lib/pairPoolLoader";
import {
  ACTIVE_STATUSES,
  CLEANUP_AFTER_MS,
  DAILY_SESSION_LIMIT,
  DAY_MS,
  HttpError,
  MIN_CANDIDATES,
  SESSION_TTL_MS,
  badRequest,
  currentUserId,
  json,
  notFound,
  serializable,
  serverError,
  unauthorized,
  type CandidateSnapshot,
} from "./shared";

const tooMany = () => json({ error: "You've started a lot of votes today. Try again tomorrow." }, 429);

/** Sessions this person started in the last 24 h (§6 F1: counted from the table, no new infrastructure). */
function startedToday(db: Pick<typeof prisma, "decideSession">, userId: string, now: Date) {
  return db.decideSession.count({
    where: { createdById: userId, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
  });
}

/**
 * POST /api/decide — start a decide session with a connected friend (§5.6).
 * Body: { partnerId, mood, sharedOnly? }. Returns { id }.
 */
export async function POST(req: NextRequest) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return badRequest("Invalid JSON");
    }
    const body = startDecideBodySchema.safeParse(raw);
    if (!body.success) return badRequest();
    const { partnerId, mood, sharedOnly } = body.data;

    const connection = await requireConnection(myId, partnerId);
    if (!connection) return notFound();

    // Cheap check before any TMDB calls, so a client loop can't burn the TMDB
    // quota. The count is repeated inside the create transaction to hold the
    // cap under concurrent requests.
    const now = new Date();
    if ((await startedToday(prisma, myId, now)) >= DAILY_SESSION_LIMIT) return tooMany();

    const [me, partner] = await Promise.all([loadPoolPerson(myId), loadPoolPerson(partnerId)]);
    const result = await buildPairPool({
      me: me.person,
      partner: partner.person,
      partnerName: partner.name,
      partnerView: { myName: me.name },
      selection: mood,
      sharedOnly: sharedOnly ?? false,
      today: now,
      fetchers: createPoolFetchers(),
      onError: warnPoolFetchFailed,
    });
    if (result.discoverFailed && result.pool.length === 0) {
      return json({ error: "Couldn't load titles. Try again." }, 502);
    }
    if (result.pool.length < MIN_CANDIDATES) {
      return json({ error: "Not enough for a vote. Try a different mood." }, 422);
    }

    // Freeze the top 30 as rounds 1–3 of 10 (ADR-4). The stored score is the
    // pool's rank weight, never the raw pair score (see lib/pairPool.ts).
    const rounds = splitIntoRounds(result.pool, ROUND_SIZE, MAX_ROUNDS);
    const candidates = rounds.flatMap((round, r) =>
      round.map((c, position) => {
        const snapshot: CandidateSnapshot = {
          title: c.title,
          posterPath: c.posterPath,
          date: c.date,
          runtime: null, // the pool doesn't carry runtimes yet
          providerIds: c.providerIds ?? [],
          reason: c.reason,
          partnerReason: c.partnerReason ?? c.reason,
        };
        return {
          mediaType: c.mediaType === "movie" ? ("MOVIE" as const) : ("TV" as const),
          tmdbId: c.id,
          round: r + 1,
          position,
          score: c.pairScore,
          snapshot: { ...snapshot },
        };
      }),
    );

    const created = await serializable(async (tx) => {
      if ((await startedToday(tx, myId, now)) >= DAILY_SESSION_LIMIT) throw new HttpError(429, "limit");
      // One open session per pair: starting another ends the old one (§6 F6).
      await tx.decideSession.updateMany({
        where: { connectionId: connection.id, status: { in: ACTIVE_STATUSES } },
        data: { status: "CANCELLED" },
      });
      // Keep the tables small: the pair's sessions older than 30 days go.
      await tx.decideSession.deleteMany({
        where: { connectionId: connection.id, createdAt: { lt: new Date(now.getTime() - CLEANUP_AFTER_MS) } },
      });
      return tx.decideSession.create({
        data: {
          connectionId: connection.id,
          createdById: myId,
          mood: { ...mood },
          expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
          candidates: { create: candidates },
        },
        select: { id: true },
      });
    });

    return json({ id: created.id }, 201);
  } catch (error) {
    if (error instanceof HttpError) return error.status === 429 ? tooMany() : error.response();
    return serverError("start", error);
  }
}

/**
 * GET /api/decide?partnerId= — the unfinished, unexpired session with this
 * friend, if any, for the Join banner (§5.6).
 */
export async function GET(req: NextRequest) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();

    const query = decideQuerySchema.safeParse({ partnerId: req.nextUrl.searchParams.get("partnerId") ?? "" });
    if (!query.success) return notFound();
    const connection = await requireConnection(myId, query.data.partnerId);
    if (!connection) return notFound();

    const session = await prisma.decideSession.findFirst({
      where: { connectionId: connection.id, status: { in: ACTIVE_STATUSES }, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdById: true, createdAt: true },
    });

    return json({
      session: session
        ? {
            id: session.id,
            createdBy: session.createdById === myId ? "me" : "partner",
            createdAt: session.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    return serverError("lookup", error);
  }
}
