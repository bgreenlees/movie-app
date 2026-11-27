import { NextRequest } from "next/server";
import { isRoundComplete, resolveRound, voteBodySchema } from "@/lib/decide";
import {
  HttpError,
  badRequest,
  currentUserId,
  json,
  loadSessionFor,
  serializable,
  serverError,
  unauthorized,
  votesByPerson,
} from "../../shared";

/**
 * PUT /api/decide/[id]/votes — cast or change the caller's vote on one
 * candidate (§5.6). Body: { candidateId, vote: 0 | 1 | 2 }.
 *
 * The candidate must belong to this session and its current round, and the
 * session must be OPEN and unexpired. The database doesn't enforce that a
 * vote's session matches its candidate's session, so that check is here.
 *
 * When this vote completes the round (both people have voted on every card)
 * the round is resolved in the same Serializable transaction, so if both
 * people cast their last vote at once it still resolves exactly once.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();

    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return badRequest("Invalid JSON");
    }
    const body = voteBodySchema.safeParse(raw);
    if (!body.success) return badRequest();
    const { candidateId, vote } = body.data;
    const rawId = (await params).id;

    const outcome = await serializable(async (tx) => {
      const access = await loadSessionFor(rawId, myId, tx);
      if (!access) throw new HttpError(404, "Not found");
      const { session, partnerId, status } = access;

      const candidate = await tx.decideCandidate.findFirst({
        where: { id: candidateId, sessionId: session.id },
        select: { id: true, round: true },
      });
      if (!candidate) throw new HttpError(404, "Not found");
      if (status !== "OPEN") throw new HttpError(409, "This vote has ended");
      if (candidate.round !== session.round) throw new HttpError(409, "That round is over");

      await tx.decideVote.upsert({
        where: { candidateId_userId: { candidateId: candidate.id, userId: myId } },
        create: { sessionId: session.id, candidateId: candidate.id, userId: myId, vote },
        update: { vote },
      });

      const roundRows = await tx.decideCandidate.findMany({
        where: { sessionId: session.id, round: session.round },
        orderBy: { position: "asc" },
        select: { id: true, score: true },
      });
      const voteRows = await tx.decideVote.findMany({
        where: { sessionId: session.id, candidateId: { in: roundRows.map((c) => c.id) } },
        select: { candidateId: true, userId: true, vote: true },
      });
      const votes = votesByPerson(voteRows, myId, partnerId);
      if (!isRoundComplete(roundRows, votes.a, votes.b)) return { status: "OPEN" as const };

      const result = resolveRound(roundRows, votes.a, votes.b);
      const next = result.matched ? ("MATCHED" as const) : ("NO_MATCH" as const);
      // Guarded on status and round, so a stale resolve can't overwrite a newer state.
      await tx.decideSession.updateMany({
        where: { id: session.id, status: "OPEN", round: session.round },
        data: result.matched
          ? { status: next, winnerId: result.winner.id, resolvedAt: new Date() }
          : { status: next },
      });
      return { status: next };
    });

    return json(outcome);
  } catch (error) {
    if (error instanceof HttpError) return error.response();
    return serverError("vote", error);
  }
}
