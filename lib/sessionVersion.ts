/**
 * Revocable JWT sessions (security audit F8, issue #148).
 *
 * Each user has a `sessionVersion` in the database. It's copied into the JWT at
 * sign-in. "Sign out everywhere" bumps it, and deleting the account removes the
 * user, so every token issued before then stops matching.
 *
 * Checking the database on every request would add a query to every API call, so
 * the token records when it was last checked (`checkedAt`) and is re-checked at
 * most once per SESSION_RECHECK_MS. That is the longest a revoked session can
 * keep working. This file holds the pure decisions; `lib/auth.ts` does the I/O.
 */

/** How often a token is re-checked against the database: 5 minutes. */
export const SESSION_RECHECK_MS = 5 * 60 * 1000;

/** Session lifetime. Each session read re-signs the JWT, so active users stay signed in. */
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;
/** How often the session's expiry is pushed forward: 1 day. */
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60;

/**
 * True when the token is due for a database check: it was never checked, its
 * timestamp is malformed, or the last check is older than the window. A
 * timestamp in the future (clock skew or tampering) also counts as due.
 */
export function needsRecheck(checkedAt: unknown, now: number): boolean {
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) return true;
  const age = now - checkedAt;
  return age < 0 || age >= SESSION_RECHECK_MS;
}

/**
 * Whether a token's version is still current for the user it belongs to.
 * `user` is null when the account no longer exists, which always ends the session.
 * A token without a version (issued before this change) counts as version 0, so
 * existing sign-ins survive the deploy but are still ended by "sign out everywhere".
 */
export function isSessionCurrent(
  tokenVersion: unknown,
  user: { sessionVersion: number } | null,
): boolean {
  if (!user) return false;
  const version = tokenVersion === undefined ? 0 : tokenVersion;
  return typeof version === "number" && version === user.sessionVersion;
}
