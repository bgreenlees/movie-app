// Watch Together "decide together": pure logic, no network or database.
// Spec: docs/specs/watch-together-decide.md §5.3 (flow), §5.6 (API), §6 (security).
//
// Movies and TV are one catalogue here (§4): nothing in this file looks at a
// candidate's media type. Rounds, matches and "pick for us" are decided by
// votes and the pair score only, so there is no quota or per-type slot.
//
// The API routes (task 9) load rows from Prisma and pass plain values in; the
// functions here only decide. Because they are pure, the vote transaction can
// be retried safely and the round still resolves the same way.

import { z } from "zod";
import type { MoodSelection } from "./moodPicker";

/** 0 = No, 1 = Yes, 2 = Really want. Also the points a vote adds to a title. */
export type Vote = 0 | 1 | 2;
export const VOTE_NO: Vote = 0;
export const VOTE_YES: Vote = 1;
export const VOTE_REALLY_WANT: Vote = 2;

export const ROUND_SIZE = 10;
export const MAX_ROUNDS = 3;
/** Runners-up shown under the winner as "Also matched". */
export const MAX_ALSO_MATCHED = 2;

/** One person's votes for a round: candidateId → vote. */
export type Votes = Readonly<Record<string, Vote>>;

/** The fields resolution needs. Real candidates carry more (snapshot, tmdbId…). */
export interface ScoredCandidate {
  id: string;
  /** Pair score at creation (0–1), for tie-breaks and "pick for us". */
  score: number;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

/**
 * Cut a ranked pool into consecutive rounds: the best `size` go in round 1,
 * the next `size` in round 2, and so on, up to `maxRounds`. The last round
 * may be short and empty rounds are left out, so a 25-title pool gives
 * 10 / 10 / 5. Anything past `size * maxRounds` is dropped.
 */
export function splitIntoRounds<T>(
  ranked: readonly T[],
  size: number = ROUND_SIZE,
  maxRounds: number = MAX_ROUNDS,
): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError("size must be a positive integer");
  if (!Number.isInteger(maxRounds) || maxRounds < 1) {
    throw new RangeError("maxRounds must be a positive integer");
  }
  const rounds: T[][] = [];
  for (let i = 0; i < maxRounds; i++) {
    const round = ranked.slice(i * size, (i + 1) * size);
    if (round.length === 0) break;
    rounds.push(round);
  }
  return rounds;
}

/**
 * True when both people have voted on every candidate in the round. An empty
 * round is never complete, so it can't resolve to "no match" by accident.
 */
export function isRoundComplete(
  candidates: readonly { id: string }[],
  votesA: Votes,
  votesB: Votes,
): boolean {
  return (
    candidates.length > 0 &&
    candidates.every((c) => isVote(votesA[c.id]) && isVote(votesB[c.id]))
  );
}

// ---------------------------------------------------------------------------
// Resolving a round
// ---------------------------------------------------------------------------

export type RoundResult<T extends ScoredCandidate> =
  | {
      matched: true;
      winner: T;
      /** Up to MAX_ALSO_MATCHED other matches, best first. */
      alsoMatched: T[];
      /** Both people voted Really want on the winner. */
      bothReallyWant: boolean;
    }
  | { matched: false };

/**
 * Find the round's winner (§5.3 step 5).
 *
 * A match is a title both people voted Yes or Really want. Matches are ranked
 * by vote sum (Really want = 2, Yes = 1), then by how many Really-wants they
 * got, then by pair score, then by their order in the round so the result is
 * always the same for the same input.
 *
 * With two people and votes of 1–2, an equal sum always means an equal number
 * of Really-wants, so in practice ties on sum go straight to the pair score.
 * The Really-want key is kept because the spec names it and it stays correct
 * if votes or group size change later.
 *
 * A missing vote counts as "not a match". Call `isRoundComplete` first: the
 * routes resolve a round only once both people have finished it.
 */
export function resolveRound<T extends ScoredCandidate>(
  candidates: readonly T[],
  votesA: Votes,
  votesB: Votes,
): RoundResult<T> {
  const matches = candidates
    .map((candidate, position) => {
      const a = votesA[candidate.id];
      const b = votesB[candidate.id];
      if (!isVote(a) || !isVote(b) || a === VOTE_NO || b === VOTE_NO) return null;
      const reallyWants = Number(a === VOTE_REALLY_WANT) + Number(b === VOTE_REALLY_WANT);
      return { candidate, position, sum: a + b, reallyWants };
    })
    .filter((m) => m !== null)
    .sort(
      (x, y) =>
        y.sum - x.sum ||
        y.reallyWants - x.reallyWants ||
        y.candidate.score - x.candidate.score ||
        x.position - y.position,
    );

  if (matches.length === 0) return { matched: false };
  const [best, ...rest] = matches;
  return {
    matched: true,
    winner: best.candidate,
    alsoMatched: rest.slice(0, MAX_ALSO_MATCHED).map((m) => m.candidate),
    bothReallyWant: best.reallyWants === 2,
  };
}

// ---------------------------------------------------------------------------
// "Just pick for us"
// ---------------------------------------------------------------------------

/**
 * "Just pick for us" after a round with no match (§5.3 step 6, §5.6).
 *
 * Returns the highest-scoring candidate that neither person voted No on.
 * `votes` is every vote in the session from both people; a candidate is
 * skipped if any of its votes is a No. If every candidate has a No, falls back
 * to the highest score overall. Equal scores keep the input order. Returns
 * `null` only when there are no candidates.
 */
export function pickForUs<T extends ScoredCandidate>(
  held: readonly T[],
  votes: readonly { candidateId: string; vote: number }[],
): T | null {
  const vetoed = new Set(votes.filter((v) => v.vote === VOTE_NO).map((v) => v.candidateId));
  const best = (list: readonly T[]) =>
    list.reduce<T | null>((top, c) => (top === null || c.score > top.score ? c : top), null);
  return best(held.filter((c) => !vetoed.has(c.id))) ?? best(held);
}

// ---------------------------------------------------------------------------
// Request validation (§5.6, §6 F5). Unknown keys are stripped (zod's default).
// ---------------------------------------------------------------------------

/** A cuid-like id: what Prisma's @default(cuid()) produces. */
const idSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9]+$/i, "invalid id");

export const voteSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);

/**
 * The mood for a decide session. Pair picks are always movies and TV together
 * (§4), so `media` is ignored and always set to "both".
 */
export const decideMoodSchema = z
  .object({
    vibe: z.enum(["any", "light", "heavy", "intense"]),
    time: z.enum(["any", "30", "120"]),
    fresh: z.boolean(),
    onMyServices: z.boolean(),
  })
  .transform((m): MoodSelection => ({
    vibe: m.vibe,
    time: m.time,
    fresh: m.fresh,
    onMyServices: m.onMyServices,
    media: "both",
  }));

/** `POST /api/decide` */
export const startDecideBodySchema = z.object({
  partnerId: idSchema,
  mood: decideMoodSchema,
  sharedOnly: z.boolean().optional(),
});
export type StartDecideBody = z.infer<typeof startDecideBodySchema>;

/** `GET /api/decide?partnerId=` */
export const decideQuerySchema = z.object({ partnerId: idSchema });

/** `[id]` in `/api/decide/[id]/…` */
export const decideSessionIdSchema = idSchema;

/** `PUT /api/decide/[id]/votes` */
export const voteBodySchema = z.object({
  candidateId: idSchema,
  vote: voteSchema,
});
export type VoteBody = z.infer<typeof voteBodySchema>;

function isVote(v: unknown): v is Vote {
  return v === 0 || v === 1 || v === 2;
}
