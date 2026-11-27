import { NextRequest } from "next/server";
import { pickForUs } from "@/lib/decide";
import {
  HttpError,
  currentUserId,
  json,
  loadSessionFor,
  serializable,
  serverError,
  unauthorized,
  votesByPerson,
} from "../../shared";

/**
 * POST /api/decide/[id]/pick — "Just pick for us" after a round with no match
 * (§5.6): the highest-scoring candidate in the session that neither person
 * voted No on (falling back to the highest overall). Status PICKED.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();
    const rawId = (await params).id;

    const outcome = await serializable(async (tx) => {
      const access = await loadSessionFor(rawId, myId, tx);
      if (!access) throw new HttpError(404, "Not found");
      const { session, partnerId, status } = access;
      if (status !== "NO_MATCH") throw new HttpError(409, "This vote can't be picked for now");

      const [held, voteRows] = await Promise.all([
        tx.decideCandidate.findMany({
          where: { sessionId: session.id },
          orderBy: [{ round: "asc" }, { position: "asc" }],
          select: { id: true, score: true },
        }),
        tx.decideVote.findMany({
          where: { sessionId: session.id },
          select: { candidateId: true, userId: true, vote: true },
        }),
      ]);
      // Only the two participants' votes count.
      const { a, b } = votesByPerson(voteRows, myId, partnerId);
      const votes = [...Object.entries(a), ...Object.entries(b)].map(([candidateId, vote]) => ({ candidateId, vote }));
      const winner = pickForUs(held, votes);
      if (!winner) throw new HttpError(409, "Nothing to pick from");

      const { count } = await tx.decideSession.updateMany({
        where: { id: session.id, status: "NO_MATCH", round: session.round },
        data: { status: "PICKED", winnerId: winner.id, resolvedAt: new Date() },
      });
      if (count === 0) throw new HttpError(409, "This vote can't be picked for now");
      return { status: "PICKED" as const };
    });

    return json(outcome);
  } catch (error) {
    if (error instanceof HttpError) return error.response();
    return serverError("pick", error);
  }
}
