/**
 * "Watch together" on What to Watch: which friend the page is set to.
 * The choice lives in the URL (`?with=<userId>`) so it survives a reload and
 * can be shared. Pure, so it's unit-tested without a browser.
 */

export interface WatchFriend {
  id: string;
  name: string;
}

/**
 * Reads the `friends` array from `GET /api/connections` (accepted connections
 * only). Keeps just id and name: never the email. A friend with no name shows
 * as "Friend". Anything malformed is skipped.
 */
export function parseFriends(body: unknown): WatchFriend[] {
  const list = body && typeof body === "object" ? (body as { friends?: unknown }).friends : undefined;
  if (!Array.isArray(list)) return [];
  const out: WatchFriend[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const f = item && typeof item === "object" ? (item as { friend?: unknown }).friend : undefined;
    if (!f || typeof f !== "object") continue;
    const { id, name } = f as { id?: unknown; name?: unknown };
    if (typeof id !== "string" || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: typeof name === "string" && name.trim() ? name.trim() : "Friend" });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The friend to watch with: the `?with=` id if it's an accepted connection,
 * else null ("Just me"). An unknown, malformed or non-friend id gets the same
 * quiet fallback, so the page never reveals whether that user exists.
 */
export function resolveWith(raw: string | null | undefined, friends: readonly WatchFriend[]): WatchFriend | null {
  if (!raw) return null;
  return friends.find((f) => f.id === raw) ?? null;
}

/** The friends list as the page knows it: loading, failed to load, or loaded. */
export type FriendsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; friends: WatchFriend[] };

/** What the page should be doing for the current `?with=` and friends list. */
export type WithMode =
  /** Waiting on the friends list (a shared link can't be resolved yet) */
  | { kind: "resolving" }
  /** The list failed to load: keep `?with=` in the URL, offer Retry, don't guess */
  | { kind: "error"; hasWith: boolean }
  | { kind: "solo" }
  | { kind: "pair"; friend: WatchFriend }
  /** Loaded, and `?with=` isn't an accepted friend: quietly drop it */
  | { kind: "stale" };

export function withMode(raw: string | null | undefined, state: FriendsState): WithMode {
  if (state.status === "loading") return raw ? { kind: "resolving" } : { kind: "solo" };
  if (state.status === "error") return { kind: "error", hasWith: !!raw };
  const friend = resolveWith(raw, state.friends);
  if (friend) return { kind: "pair", friend };
  return raw ? { kind: "stale" } : { kind: "solo" };
}

/** What to Watch with a friend selected (the one page for picks and shelves). */
export function whatToWatchWithHref(friendId: string): string {
  return `/what-to-watch?with=${encodeURIComponent(friendId)}`;
}
