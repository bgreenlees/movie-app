// Shared trait vocabulary for movies and TV — pure, no network or database.
//
// TMDB gives movies and TV different genre ids (TV merges "Action & Adventure"
// and "Sci-Fi & Fantasy", has no Thriller or Horror, and adds Kids, War &
// Politics, ...). Taste is stored as traits, not types (spec §4), so both id
// sets map onto one set of strings: a Love for a sci-fi film then lifts a
// sci-fi show exactly as much as another sci-fi film.

import type { MediaType } from "./moodPicker";

export type Trait = string;

/** TMDB movie genre id → traits. TV Movie (10770) is a format, not a trait. */
export const MOVIE_GENRE_TRAITS: Readonly<Record<number, readonly Trait[]>> = {
  28: ["action"],
  12: ["adventure"],
  16: ["animation"],
  35: ["comedy"],
  80: ["crime"],
  99: ["documentary"],
  18: ["drama"],
  10751: ["family"],
  14: ["fantasy"],
  36: ["history"],
  27: ["horror"],
  10402: ["music"],
  9648: ["mystery"],
  10749: ["romance"],
  878: ["scifi"],
  53: ["thriller"],
  10752: ["war"],
  37: ["western"],
};

/** TMDB TV genre id → traits. Combined TV genres expand to both movie traits. */
export const TV_GENRE_TRAITS: Readonly<Record<number, readonly Trait[]>> = {
  10759: ["action", "adventure"], // Action & Adventure
  16: ["animation"],
  35: ["comedy"],
  80: ["crime"],
  99: ["documentary"],
  18: ["drama"],
  10751: ["family"],
  10762: ["family"], // Kids
  9648: ["mystery"],
  10763: ["news"],
  10764: ["reality"],
  10765: ["scifi", "fantasy"], // Sci-Fi & Fantasy
  10766: ["soap"],
  10767: ["talk"],
  10768: ["war"], // War & Politics
  37: ["western"],
};

/** The shared traits a title carries, deduplicated. Unknown genre ids are skipped. */
export function traitsFor(mediaType: MediaType, genreIds: readonly number[]): Trait[] {
  const table = mediaType === "movie" ? MOVIE_GENRE_TRAITS : TV_GENRE_TRAITS;
  const out = new Set<Trait>();
  for (const id of genreIds) for (const t of table[id] ?? []) out.add(t);
  return [...out];
}

/**
 * Genre ids from a cached `Movie.genres` / `TVShow.genres` JSON column, which
 * holds TMDB's `[{ id, name }]`. Plain id arrays are accepted too. Anything
 * else (null, malformed) gives `[]`, so a bad cache row never throws.
 */
export function genreIdsFromJson(json: unknown): number[] {
  if (!Array.isArray(json)) return [];
  const ids: number[] = [];
  for (const g of json) {
    const id = typeof g === "number" ? g : (g as { id?: unknown } | null)?.id;
    if (typeof id === "number" && Number.isInteger(id)) ids.push(id);
  }
  return ids;
}
