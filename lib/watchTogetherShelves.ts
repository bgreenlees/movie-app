/**
 * The Watch Together page's shelves ("Both want to watch", "Sam loved or liked,
 * not on your lists", …), built from two people's movie and TV lists. Pure: the
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
  /** 3 = Love, 2 = Like; set on the "loved or liked" shelves so cards can badge it */
  rating?: number;
}

export interface Shelves {
  bothWantToWatch: ShelfItem[];
  friendLovedForMe: ShelfItem[];
  iLovedForFriend: ShelfItem[];
}

/** Cards per "loved" shelf. */
export const SHELF_SIZE = 12;
/** Default cap on joint seeds (titles both liked); the pair pool passes its own. */
export const FRESH_SEEDS = 5;

export const shelfKey = (x: { mediaType: ShelfMedia; tmdbId?: number; id?: number }) =>
  `${x.mediaType}-${x.tmdbId ?? x.id}`;

/**
 * Like (2) or Love (3). Ratings outside 1–3 exist (F5: PATCH isn't
 * range-checked) and are treated as unknown, not as a very big Love.
 */
export const isLiked = (rating: number | null) => rating === 2 || rating === 3;

/**
 * Liked and not since ruled out. An entry marked not interested can keep an
 * old Like rating (PATCH doesn't clear it), so it mustn't count as "loved".
 */
const isLikedEntry = (e: ShelfEntry) => e.status !== "NOT_INTERESTED" && isLiked(e.rating);

const toItem = (e: ShelfEntry): ShelfItem => ({
  id: e.tmdbId,
  mediaType: e.mediaType,
  title: e.title,
  posterPath: e.posterPath,
  date: e.date,
});

const toRatedItem = (e: ShelfEntry): ShelfItem => ({ ...toItem(e), rating: e.rating ?? undefined });

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

  // "Not on the other list" is all we know: they may have seen it and never
  // rated it. Anything on their lists counts, so a title marked not interested
  // isn't pushed as a pick. Loves (3) come before Likes (2).
  const lovedNotOn = (from: readonly ShelfEntry[], other: Set<string>) =>
    from
      .filter((e) => isLikedEntry(e) && !other.has(shelfKey(e)))
      .sort(byRatingThenRecent)
      .slice(0, SHELF_SIZE)
      .map(toRatedItem);

  return {
    bothWantToWatch,
    friendLovedForMe: lovedNotOn(theirs, myKeys),
    iLovedForFriend: lovedNotOn(mine, theirKeys),
  };
}

/**
 * Seeds for the pair pool's recommendation source: titles both people liked,
 * Loves first, at most `limit`. Each seed costs one TMDB call of its own type.
 * `bothLoved` is true when both rated it a Love (else one only liked it), so a
 * reason can say "loved" or "liked".
 */
export function freshSeeds(
  mine: readonly ShelfEntry[],
  theirs: readonly ShelfEntry[],
  limit = FRESH_SEEDS
): { mediaType: ShelfMedia; tmdbId: number; bothLoved: boolean }[] {
  const theirLiked = new Map(theirs.filter(isLikedEntry).map((e) => [shelfKey(e), e]));
  return mine
    .filter((e) => isLikedEntry(e) && theirLiked.has(shelfKey(e)))
    .map((e) => ({ e, sum: (e.rating ?? 0) + (theirLiked.get(shelfKey(e))!.rating ?? 0) }))
    .sort((a, b) => b.sum - a.sum || b.e.addedAt - a.e.addedAt)
    .slice(0, limit)
    .map(({ e, sum }) => ({ mediaType: e.mediaType, tmdbId: e.tmdbId, bothLoved: sum === 6 }));
}
