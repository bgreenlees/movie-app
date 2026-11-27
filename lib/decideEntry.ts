// Entry points for "Decide together" (spec §5.3 step 1–2, §5.5): the start
// request, the Join banner's wording, and the consent line. Pure, no network.

import type { MoodSelection } from "./moodPicker";
import { partnerLabel } from "./decideView";

/** Shown wherever friend requests are sent and accepted (spec §5.5, owner decision Q3). */
export const CONSENT_LINE =
  "Friends can see what's on your lists and what you've loved, and can start a Watch Together vote with you.";

/** How often the Join banner re-checks for a session (ms). Reads only the database. */
export const BANNER_POLL_MS = 15_000;

/** The `POST /api/decide` body. Only the four moods the route accepts; media is always "both" there. */
export function startDecideRequest(partnerId: string, mood: MoodSelection) {
  return {
    partnerId,
    mood: { vibe: mood.vibe, time: mood.time, fresh: mood.fresh, onMyServices: mood.onMyServices },
  };
}

/** What the start sheet says when `POST /api/decide` fails (spec §5.3 states table). */
export function startErrorMessage(status: number): string {
  if (status === 422) return "Not enough for a vote. Try a different mood.";
  if (status === 429) return "You've started a lot of votes today. Try again tomorrow.";
  if (status === 404) return "You can only decide together with friends who've accepted your request.";
  return "Couldn't start. Try again.";
}

/** The `GET /api/decide?partnerId=` session, as the banner needs it. */
export interface ActiveSession {
  id: string;
  createdBy: "me" | "partner";
}

/** Reads the GET response defensively: anything unexpected means "no banner". */
export function parseActiveSession(body: unknown): ActiveSession | null {
  if (typeof body !== "object" || body === null) return null;
  const s = (body as { session?: unknown }).session;
  if (typeof s !== "object" || s === null) return null;
  const { id, createdBy } = s as { id?: unknown; createdBy?: unknown };
  if (typeof id !== "string" || id === "") return null;
  if (createdBy !== "me" && createdBy !== "partner") return null;
  return { id, createdBy };
}

/** Banner copy and button label: Join if the friend started it, Resume if I did. */
export function bannerCopy(session: ActiveSession, partnerName: string | null | undefined) {
  const name = partnerLabel(partnerName);
  return session.createdBy === "partner"
    ? { text: `${name} started a vote`, action: "Join" }
    : { text: `Your vote with ${name} is open`, action: "Resume" };
}

export const decideHref = (sessionId: string) => `/decide/${encodeURIComponent(sessionId)}`;

/**
 * Where Tab/Shift+Tab should move focus inside a dialog with `count` focusable items.
 * `current` is the focused item's index, or -1 if focus is outside the list (e.g. on the panel).
 * Wraps at both ends; returns -1 when there is nothing to focus.
 */
export function nextTabIndex(count: number, current: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}
