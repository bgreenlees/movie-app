// Client-side sort and filter for lists of TMDB results (search, person and
// genre pages). Pure functions so they can be tested without the network.

export type SortOption = "relevance" | "newest" | "oldest" | "az" | "za" | "rating";

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: "relevance", label: "Most popular" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Title A–Z" },
  { value: "za", label: "Title Z–A" },
  { value: "rating", label: "Highest rated" },
];

export function isSortOption(value: string | null | undefined): value is SortOption {
  return SORT_OPTIONS.some((o) => o.value === value);
}

// Works for both movies (title/release_date) and TV shows (name/first_air_date).
export interface FilterableItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
}

export interface ResultFilterState {
  sort: SortOption;
  /** Keep items that have every one of these genres. Empty = no genre filter. */
  genreIds: number[];
  /** When set, keep only items whose id is in this set (e.g. shared credits with co-stars). */
  onlyIds?: Set<number> | null;
}

export const DEFAULT_FILTERS: ResultFilterState = { sort: "relevance", genreIds: [] };

const itemTitle = (i: FilterableItem) => i.title ?? i.name ?? "";
const itemDate = (i: FilterableItem) => i.release_date || i.first_air_date || "";

/** Strips a leading "The", "A" or "An" so "The Office" sorts under O. */
export function sortableTitle(title: string): string {
  return title.trim().replace(/^(the|a|an)\s+/i, "");
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

function compareTitles(a: FilterableItem, b: FilterableItem): number {
  return collator.compare(sortableTitle(itemTitle(a)), sortableTitle(itemTitle(b)));
}

// Items with no date go last whichever direction we sort, since "unknown" is
// neither newest nor oldest. ISO dates compare correctly as strings.
function compareDates(a: FilterableItem, b: FilterableItem, newestFirst: boolean): number {
  const da = itemDate(a);
  const db = itemDate(b);
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return newestFirst ? db.localeCompare(da) : da.localeCompare(db);
}

// A 10/10 from three votes shouldn't outrank an 8.5 from thousands, so items
// with few votes sort after well-rated ones.
const MIN_VOTES_FOR_RATING = 20;

function compareRatings(a: FilterableItem, b: FilterableItem): number {
  const aRated = (a.vote_count ?? 0) >= MIN_VOTES_FOR_RATING;
  const bRated = (b.vote_count ?? 0) >= MIN_VOTES_FOR_RATING;
  if (aRated !== bRated) return aRated ? -1 : 1;
  return (b.vote_average ?? 0) - (a.vote_average ?? 0);
}

export function applyResultFilters<T extends FilterableItem>(items: T[], filters: ResultFilterState): T[] {
  const { sort, genreIds, onlyIds } = filters;
  const filtered = items.filter((item) => {
    if (onlyIds && !onlyIds.has(item.id)) return false;
    if (genreIds.length > 0) {
      const ids = item.genre_ids ?? [];
      if (!genreIds.every((g) => ids.includes(g))) return false;
    }
    return true;
  });

  // "relevance" keeps the order we were given (already ranked by the API).
  if (sort === "relevance") return filtered;
  // Array.prototype.sort is stable, so ties keep their relevance order.
  return [...filtered].sort((a, b) => {
    switch (sort) {
      case "newest":
        return compareDates(a, b, true);
      case "oldest":
        return compareDates(a, b, false);
      case "az":
        return compareTitles(a, b);
      case "za":
        return compareTitles(b, a);
      case "rating":
        return compareRatings(a, b);
    }
  });
}

/**
 * Genres that appear in the results, most common first, with how many items
 * have each. Genres with no known name are left out.
 */
export function genresInResults(
  items: FilterableItem[],
  genreNames: Record<number, string>
): Array<{ id: number; name: string; count: number }> {
  const counts = new Map<number, number>();
  for (const item of items) {
    for (const g of new Set(item.genre_ids ?? [])) counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([id]) => genreNames[id])
    .map(([id, count]) => ({ id, name: genreNames[id], count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Ids present in every one of the given lists. Null when there are no lists. */
export function intersectIds(lists: Array<Array<{ id: number }>>): Set<number> | null {
  if (lists.length === 0) return null;
  let result = new Set(lists[0].map((x) => x.id));
  for (const list of lists.slice(1)) {
    const ids = new Set(list.map((x) => x.id));
    result = new Set([...result].filter((id) => ids.has(id)));
  }
  return result;
}

// ── URL encoding ────────────────────────────────────────────────────────────
// Filters live in the page URL (?sort=newest&genres=35,16&with=4495) so a
// filtered view survives a refresh and can be shared.

const MAX_URL_IDS = 10;

/** Parses "35,16,abc,35" → [35, 16]: positive integers only, no duplicates, capped. */
export function parseIdList(value: string | null | undefined): number[] {
  if (!value) return [];
  const ids: number[] = [];
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const n = Number(trimmed);
    if (n > 0 && Number.isSafeInteger(n) && !ids.includes(n)) ids.push(n);
    if (ids.length >= MAX_URL_IDS) break;
  }
  return ids;
}

export interface UrlFilterState {
  sort: SortOption;
  genreIds: number[];
  coStarIds: number[];
}

export function readUrlFilters(params: { get(name: string): string | null }): UrlFilterState {
  const sort = params.get("sort");
  return {
    sort: isSortOption(sort) ? sort : "relevance",
    genreIds: parseIdList(params.get("genres")),
    coStarIds: parseIdList(params.get("with")),
  };
}

/** Writes the filters into params, removing any that are at their default. */
export function writeUrlFilters(params: URLSearchParams, filters: Partial<UrlFilterState>): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  const set = (key: string, value: string) => (value ? next.set(key, value) : next.delete(key));
  if (filters.sort !== undefined) set("sort", filters.sort === "relevance" ? "" : filters.sort);
  if (filters.genreIds !== undefined) set("genres", filters.genreIds.join(","));
  if (filters.coStarIds !== undefined) set("with", filters.coStarIds.join(","));
  return next;
}
