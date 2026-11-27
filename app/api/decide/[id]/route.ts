import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { MAX_ROUNDS, resolveRound } from "@/lib/decide";
import {
  ACTIVE_STATUSES,
  candidateView,
  currentUserId,
  json,
  loadSessionFor,
  notFound,
  serverError,
  storedMood,
  unauthorized,
  votesByPerson,
  type CandidateView,
} from "../shared";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/decide/[id] — the session from the caller's point of view (§5.6).
 * Polled every few seconds, so it reads only the database (no TMDB calls).
 *
 * Privacy (§5.5): the caller gets their own votes and a count of the
 * partner's, never the partner's votes. Once the round is resolved, the
 * result names only the matched titles.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();
    const access = await loadSessionFor((await params).id, myId);
    if (!access) return notFound();
    const { session, partnerId, status } = access;
    const viewerIsCreator = session.createdById === myId;

    const [roundRows, partner] = await Promise.all([
      prisma.decideCandidate.findMany({
        where: { sessionId: session.id, round: session.round },
        orderBy: { position: "asc" },
        select: { id: true, mediaType: true, tmdbId: true, snapshot: true, score: true },
      }),
      prisma.user.findUnique({ where: { id: partnerId }, select: { name: true } }),
    ]);
    const voteRows = await prisma.decideVote.findMany({
      where: { sessionId: session.id, candidateId: { in: roundRows.map((c) => c.id) } },
      select: { candidateId: true, userId: true, vote: true },
    });
    const votes = votesByPerson(voteRows, myId, partnerId);

    let result:
      | { winner: CandidateView; alsoMatched: CandidateView[]; bothReallyWant: boolean; picked: boolean }
      | undefined;
    if ((session.status === "MATCHED" || session.status === "PICKED") && session.winnerId) {
      const winner = await prisma.decideCandidate.findFirst({
        where: { id: session.winnerId, sessionId: session.id },
        select: { id: true, mediaType: true, tmdbId: true, snapshot: true },
      });
      if (winner) {
        // Re-derive the reveal from the round's votes: resolveRound is pure, so
        // it gives the same winner the vote transaction stored.
        const resolved = session.status === "MATCHED" ? resolveRound(roundRows, votes.a, votes.b) : null;
        const matched = resolved?.matched ? resolved : null;
        result = {
          winner: candidateView(winner, viewerIsCreator),
          alsoMatched: (matched?.alsoMatched ?? [])
            .filter((c) => c.id !== winner.id)
            .map((c) => candidateView(c, viewerIsCreator)),
          bothReallyWant: matched?.winner.id === winner.id ? matched.bothReallyWant : false,
          picked: session.status === "PICKED",
        };
      }
    }

    return json({
      id: session.id,
      status,
      round: session.round,
      maxRound: MAX_ROUNDS,
      partner: { id: partnerId, name: partner?.name ?? null },
      mood: storedMood(session.mood),
      candidates: roundRows.map((c) => candidateView(c, viewerIsCreator)),
      myVotes: votes.a,
      partnerProgress: { voted: Object.keys(votes.b).length, total: roundRows.length },
      ...(result ? { result } : {}),
    });
  } catch (error) {
    return serverError("read", error);
  }
}

/**
 * DELETE /api/decide/[id] — either person cancels (§5.6). A session that has
 * already ended (matched, picked, cancelled) is left as it is; either way the
 * answer is the session's status.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();
    const access = await loadSessionFor((await params).id, myId);
    if (!access) return notFound();

    const { count } = await prisma.decideSession.updateMany({
      where: { id: access.session.id, status: { in: ACTIVE_STATUSES } },
      data: { status: "CANCELLED" },
    });
    return json({ status: count > 0 ? "CANCELLED" : access.status });
  } catch (error) {
    return serverError("cancel", error);
  }
}
