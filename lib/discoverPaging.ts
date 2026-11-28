// Paging helpers for "load more" at the bottom of Discover (issue #186).
// Pure functions only, so they're unit-tested without a browser, database or network.

/** Highest page the API will serve. Keeps a script from walking TMDB's whole catalogue. */
export const MAX_DISCOVER_PAGE = 20;

/**
 * Parses a `page` query value. A missing value means page 1. Anything that isn't a whole
 * number from 1 to MAX_DISCOVER_PAGE (so "0", "-1", "2.5", "abc", "21") returns null,
 * which routes answer with a 400.
 */
export function parsePage(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return 1;
  if (!/^\d{1,3}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_DISCOVER_PAGE ? n : null;
}

/** Appends `incoming` to `existing`, dropping any title whose id is already there (or repeated within incoming). */
export function mergePage<T extends { id: number }>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((t) => t.id));
  const added: T[] = [];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    added.push(item);
  }
  return added.length ? [...existing, ...added] : existing;
}

/**
 * Trims a list to whole rows so the last row of the grid is never ragged. Only the tail is
 * cut, so the hidden titles show up once the next page is appended. A list shorter than one
 * row is returned whole.
 */
export function trimToFullRows<T>(items: T[], columns: number): T[] {
  if (columns < 1) return items;
  const whole = Math.floor(items.length / columns) * columns;
  return whole > 0 ? items.slice(0, whole) : items;
}

export interface DiscoverMode {
  mediaType: "movie" | "tv";
  query: string;
  genreId: string | null;
  genreMedia: "movie" | "tv" | null;
  country: string | null;
  /** Movies only: whether page 1 came from the personalised feed (else the contextual one). */
  personalized: boolean;
}

/** The API URL that serves `page` of the current Discover view. */
export function discoverEndpoint(mode: DiscoverMode, page: number): string {
  const p = page > 1 ? `page=${page}` : "";
  const join = (base: string, ...params: string[]) => {
    const qs = params.filter(Boolean).join("&");
    return qs ? `${base}?${qs}` : base;
  };
  if (mode.genreId) {
    const media = mode.genreMedia || "movie";
    return join(
      `/api/discover/${media}`,
      `genreId=${encodeURIComponent(mode.genreId)}`,
      mode.country ? `country=${mode.country}` : "",
      p
    );
  }
  if (mode.country) return join(`/api/discover/${mode.mediaType}`, `country=${mode.country}`, p);
  if (mode.query) {
    const base = mode.mediaType === "movie" ? "/api/movies/search" : "/api/tv/search";
    return join(base, `q=${encodeURIComponent(mode.query)}`, p);
  }
  if (mode.mediaType === "tv") return join("/api/tv/recommended", p);
  return join(mode.personalized ? "/api/movies/recommended" : "/api/movies/contextual", p);
}
