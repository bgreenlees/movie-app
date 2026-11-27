// Pure helpers for rating a title from its detail page. Same API calls the
// poster cards make (thumb ratings 1–3, 0 clears), so both show one rating.

export type RateKind = "movie" | "tv";

export interface RateRequest {
  url: string;
  method: "PATCH" | "POST";
  body: Record<string, unknown>;
}

/** Clamp anything odd to 0 (none); valid thumb ratings are 1–3. */
export function normalizeRating(value: number | null | undefined): number {
  return value === 1 || value === 2 || value === 3 ? value : 0;
}

/** Tapping the selected thumb again clears the rating. */
export function nextRating(current: number, tapped: number): number {
  return current === tapped ? 0 : normalizeRating(tapped);
}

/**
 * The request that saves a rating. With an existing list entry it updates it
 * (0 clears). Without one, rating adds the title as Watched; clearing a rating
 * on an unlisted title has nothing to save, so it returns null.
 */
export function buildRateRequest(
  kind: RateKind,
  titleId: number,
  entryId: string | null,
  rating: number
): RateRequest | null {
  const r = normalizeRating(rating);
  if (entryId) {
    const base = kind === "movie" ? "/api/watchlist" : "/api/tv/watchlist";
    return { url: `${base}/${encodeURIComponent(entryId)}`, method: "PATCH", body: { rating: r || null } };
  }
  if (r === 0) return null;
  return kind === "movie"
    ? { url: "/api/watchlist", method: "POST", body: { movieId: titleId, status: "WATCHED", rating: r } }
    : { url: "/api/tv/watchlist", method: "POST", body: { tvShowId: titleId, status: "WATCHED", rating: r } };
}
