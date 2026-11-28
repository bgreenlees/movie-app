/**
 * Which feed the Discover fallback ("contextual") shows (issue #181).
 *
 * The old route picked genres from the *server's UTC hour*, so a US evening
 * (UTC night) got Horror/Crime for brand-new users. Now:
 *  - a user with no positive ratings always gets the same popular/trending feed,
 *  - a user with ratings may get a time-of-day mood, but only from the hour in
 *    *their own* timezone, which the browser sends. No valid hour means no mood.
 */
export const TIME_SLOTS = [
  { label: "Late Night", hours: [0, 1, 2, 3, 4, 5], genres: [27, 9648, 80] }, // Horror, Mystery, Crime
  { label: "Morning", hours: [6, 7, 8, 9, 10, 11], genres: [35, 18, 10749] }, // Comedy, Drama, Romance
  { label: "Afternoon", hours: [12, 13, 14, 15, 16, 17], genres: [12, 10751, 16] }, // Adventure, Family, Animation
  { label: "Evening", hours: [18, 19, 20, 21, 22, 23], genres: [28, 878, 53] }, // Action, Sci-Fi, Thriller
] as const;

/** Parses the `hour` query value; anything but an integer 0-23 is null. */
export function parseLocalHour(raw: unknown): number | null {
  if (typeof raw !== "string" || !/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 0 && n <= 23 ? n : null;
}

export type ContextualPlan =
  | { kind: "trending"; label: string }
  | { kind: "genres"; label: string; genres: number[] };

export function planContextualFeed(hasRatings: boolean, localHour: number | null): ContextualPlan {
  if (!hasRatings || localHour === null) return { kind: "trending", label: "Trending" };
  const slot = TIME_SLOTS.find((s) => (s.hours as readonly number[]).includes(localHour));
  if (!slot) return { kind: "trending", label: "Trending" };
  return { kind: "genres", label: slot.label, genres: [...slot.genres] };
}
