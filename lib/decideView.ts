// Pure helpers for the decide screen (`/decide/[sessionId]`), spec
// docs/specs/watch-together-decide.md §5.3 and §7. Kept out of the page so the
// "which screen?" and input rules can be unit-tested without React.

import type { Vote } from "./decide";

export type SessionStatus = "OPEN" | "MATCHED" | "NO_MATCH" | "PICKED" | "CANCELLED" | "EXPIRED";

export interface DecideCandidateView {
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

/** The `GET /api/decide/[id]` response (§5.6). */
export interface DecideSessionView {
  id: string;
  status: SessionStatus;
  round: number;
  maxRound: number;
  partner: { id: string; name: string | null };
  candidates: DecideCandidateView[];
  myVotes: Record<string, Vote>;
  partnerProgress: { voted: number; total: number };
  result?: {
    winner: DecideCandidateView;
    alsoMatched: DecideCandidateView[];
    bothReallyWant: boolean;
    picked: boolean;
  };
}

export type Screen = "vote" | "wait" | "reveal" | "no-match" | "ended";

/**
 * Which screen to show for a session.
 * - MATCHED / PICKED with a result → reveal
 * - NO_MATCH → no match (Try 10 more / Just pick for us)
 * - CANCELLED / EXPIRED, or a resolved session missing its result → ended
 * - OPEN → vote until I've voted on every card, then wait for the partner
 */
export function screenFor(s: Pick<DecideSessionView, "status" | "candidates" | "myVotes" | "result">): Screen {
  switch (s.status) {
    case "MATCHED":
    case "PICKED":
      return s.result ? "reveal" : "ended";
    case "NO_MATCH":
      return "no-match";
    case "OPEN":
      return votedCount(s.candidates, s.myVotes) >= s.candidates.length && s.candidates.length > 0 ? "wait" : "vote";
    default:
      return "ended";
  }
}

/** How many of this round's cards I've voted on. */
export function votedCount(candidates: readonly { id: string }[], myVotes: Readonly<Record<string, Vote>>): number {
  return candidates.filter((c) => isVote(myVotes[c.id])).length;
}

/** The card to show when the page loads or a new round starts: the first one I haven't voted on. */
export function firstUnvotedIndex(
  candidates: readonly { id: string }[],
  myVotes: Readonly<Record<string, Vote>>,
): number {
  const i = candidates.findIndex((c) => !isVote(myVotes[c.id]));
  return i === -1 ? candidates.length : i;
}

/**
 * The card to move to after voting on card `from`: the next unvoted card
 * after it, else the first unvoted one before it (after an Undo), else the
 * end of the round (`candidates.length`, the wait screen).
 */
export function nextUnvotedIndex(
  candidates: readonly { id: string }[],
  myVotes: Readonly<Record<string, Vote>>,
  from: number,
): number {
  for (let i = from + 1; i < candidates.length; i++) if (!isVote(myVotes[candidates[i].id])) return i;
  return firstUnvotedIndex(candidates, myVotes);
}

/** Keyboard shortcuts on the vote card (§5.3): ← No, → Yes, ↑ Really want. */
export function voteForKey(key: string): Vote | null {
  if (key === "ArrowLeft") return 0;
  if (key === "ArrowRight") return 1;
  if (key === "ArrowUp") return 2;
  return null;
}

/** How far a finger must travel (px) before a swipe counts as a vote. */
export const SWIPE_THRESHOLD = 80;

/**
 * A swipe on the vote card: left = No, right = Yes, up = Really want. Mostly
 * vertical or short movements are ignored, so scrolling the page doesn't vote.
 */
export function voteForSwipe(dx: number, dy: number, threshold = SWIPE_THRESHOLD): Vote | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax >= threshold && ax > ay * 1.5) return dx < 0 ? 0 : 1;
  if (dy <= -threshold && ay > ax * 1.5) return 2;
  return null;
}

/** Polls of `GET /api/decide/[id]` that may fail in a row before "Reconnecting…" shows (§5.3). */
export const RECONNECT_AFTER_FAILURES = 3;

/** Poll interval (ms) per screen: 3 s while waiting (§5.3, ADR-3), slower while voting to notice a cancel or expiry. */
export function pollInterval(screen: Screen): number | null {
  if (screen === "wait" || screen === "no-match") return 3_000;
  if (screen === "vote") return 15_000;
  return null; // reveal and ended are final
}

/** "2024 · Movie · 1 h 52 m" for the vote card. */
export function cardMeta(c: Pick<DecideCandidateView, "date" | "mediaType" | "runtime">): string {
  const year = /^\d{4}/.test(c.date) ? c.date.slice(0, 4) : null;
  const parts = [year, c.mediaType === "movie" ? "Movie" : "TV"];
  if (c.runtime && c.runtime > 0) {
    const h = Math.floor(c.runtime / 60);
    const m = c.runtime % 60;
    parts.push(h > 0 ? `${h} h${m ? ` ${m} m` : ""}` : `${m} m`);
  }
  return parts.filter(Boolean).join(" · ");
}

/** The partner's name for copy, never an email (§7). */
export function partnerLabel(name: string | null | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.split(/\s+/)[0] : "your friend";
}

function isVote(v: unknown): v is Vote {
  return v === 0 || v === 1 || v === 2;
}
