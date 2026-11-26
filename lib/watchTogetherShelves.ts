/**
 * The Watch Together page's shelves ("Both want to watch", "Sam loved — you
 * haven't seen", …), built from two people's movie and TV lists. Pure: the
 * route loads the entries and fetches the TMDB recommendations.
 *
 * Movies and TV are one catalogue here too (spec §4): every shelf mixes them,
 * ordered by rating or recency, with no per-type slots.
 */

export type ShelfMedia = "movie" | "tv";

/** One watchlist row, movie or TV, in a shared shape. */
export interface ShelfEntry {
  mediaType: ShelfMedia;
  tmdbId: number;
  /** WANT_TO_WATCH, WATCHING (TV only), WATCHED or NOT_INTERESTED */
  status: string;
  rating: number | null;
  addedAt: number;
  title: string;
  posterPath: string | null;
  date: string | null;
}

/** What the page renders for each card. */
export interface ShelfItem {
  id: number;
  mediaType: ShelfMedia;
  title: string;
  posterPath: string | null;
  date: string | null;
}

export interface Shelves {
  bothWantToWatch: ShelfItem[];
  friendLovedForMe: ShelfItem[];
  iLovedForFriend: ShelfItem[];
}

/** Cards per "loved" shelf, and per fresh-picks shelf. */
export const SHELF_SIZE = 12;
/** TMDB recommendation calls per page load (spec §6, F1). */
export const FRESH_SEEDS = 5;

export const shelfKey = (x: { mediaType: ShelfMedia; tmdbId?: number; id?: number }) =>
  `${x.mediaType}-${x.tmdbId ?? x.id}`;

/**
 * Like (2) or Love (3). Ratings outside 1–3 exist (F5: PATCH isn't
 * range-checked) and are treated as unknown, not as a very big Love.
 */
export const isLiked = (rating: number | null) => rating === 2 || rating === 3;

const toItem = (e: ShelfEntry): ShelfItem => ({
  id: e.tmdbId,
  mediaType: e.mediaType,
  title: e.title,
  posterPath: e.posterPath,
  date: e.date,
});

/** Loves before Likes, then most recently added. */
const byRatingThenRecent = (a: ShelfEntry, b: ShelfEntry) =>
  (b.rating ?? 0) - (a.rating ?? 0) || b.addedAt - a.addedAt;

export function buildShelves(mine: readonly ShelfEntry[], theirs: readonly ShelfEntry[]): Shelves {
  const myKeys = new Set(mine.map(shelfKey));
  const theirKeys = new Set(theirs.map(shelfKey));
  const myWants = new Set(mine.filter((e) => e.status === "WANT_TO_WATCH").map(shelfKey));

  const bothWantToWatch = theirs
    .filter((e) => e.status === "WANT_TO_WATCH" && myWants.has(shelfKey(e)))
    .sort((a, b) => b.addedAt - a.addedAt)
    .map(toItem);

  // Anything on my lists counts as "seen or known" here, as before: a title I
  // marked not interested shouldn't be pushed at me as "Sam loved".
  const lovedNotOn = (from: readonly ShelfEntry[], other: Set<string>) =>
    from
      .filter((e) => isLiked(e.rating) && !other.has(shelfKey(e)))
      .sort(byRatingThenRecent)
      .slice(0, SHELF_SIZE)
      .map(toItem);

  return {
    bothWantToWatch,
    friendLovedForMe: lovedNotOn(theirs, myKeys),
    iLovedForFriend: lovedNotOn(mine, theirKeys),
  };
}

/**
 * Seeds for "Fresh picks": titles both people liked, Loves first, at most
 * FRESH_SEEDS. Each seed costs one TMDB call of its own type.
 */
export function freshSeeds(
  mine: readonly ShelfEntry[],
  theirs: readonly ShelfEntry[]
): { mediaType: ShelfMedia; tmdbId: number }[] {
  const theirLiked = new Map(theirs.filter((e) => isLiked(e.rating)).map((e) => [shelfKey(e), e]));
  return mine
    .filter((e) => isLiked(e.rating) && theirLiked.has(shelfKey(e)))
    .map((e) => ({ e, sum: (e.rating ?? 0) + (theirLiked.get(shelfKey(e))!.rating ?? 0) }))
    .sort((a, b) => b.sum - a.sum || b.e.addedAt - a.e.addedAt)
    .slice(0, FRESH_SEEDS)
    .map(({ e }) => ({ mediaType: e.mediaType, tmdbId: e.tmdbId }));
}

/**
 * Merge recommendation lists into one shelf: titles recommended by more seeds
 * first, then by the order TMDB gave. Drops anything on either person's lists
 * and anything without a poster.
 */
export function rankFreshPicks(
  recLists: readonly ShelfItem[][],
  exclude: ReadonlySet<string>
): ShelfItem[] {
  const tally = new Map<string, { item: ShelfItem; count: number; first: number }>();
  let order = 0;
  for (const list of recLists) {
    for (const item of list) {
      const key = shelfKey(item);
      if (exclude.has(key) || !item.posterPath) continue;
      const seen = tally.get(key);
      if (seen) seen.count += 1;
      else tally.set(key, { item, count: 1, first: order++ });
    }
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, SHELF_SIZE)
    .map((t) => t.item);
}
