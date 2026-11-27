import { NextRequest } from "next/server";
import { MAX_ROUNDS } from "@/lib/decide";
import {
  HttpError,
  currentUserId,
  json,
  loadSessionFor,
  serializable,
  serverError,
  unauthorized,
} from "../../shared";

/**
 * POST /api/decide/[id]/next-round — "Try 10 more" after a round with no
 * match (§5.6): NO_MATCH and round < 3 → the next round, status OPEN.
 * 409 otherwise, including when the next round has no titles (a small pool).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const myId = await currentUserId();
    if (!myId) return unauthorized();
    const rawId = (await params).id;

    const outcome = await serializable(async (tx) => {
      const access = await loadSessionFor(rawId, myId, tx);
      if (!access) throw new HttpError(404, "Not found");
      const { session, status } = access;
      if (status !== "NO_MATCH" || session.round >= MAX_ROUNDS) {
        throw new HttpError(409, "There's no next round for this vote");
      }
      const nextRound = session.round + 1;
      const held = await tx.decideCandidate.count({ where: { sessionId: session.id, round: nextRound } });
      if (held === 0) throw new HttpError(409, "There's no next round for this vote");

      const { count } = await tx.decideSession.updateMany({
        where: { id: session.id, status: "NO_MATCH", round: session.round },
        data: { status: "OPEN", round: nextRound },
      });
      if (count === 0) throw new HttpError(409, "There's no next round for this vote");
      return { status: "OPEN" as const, round: nextRound };
    });

    return json(outcome);
  } catch (error) {
    if (error instanceof HttpError) return error.response();
    return serverError("next round", error);
  }
}
