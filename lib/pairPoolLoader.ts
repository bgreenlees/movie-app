// Database and TMDB wiring for the pair pool (lib/pairPool.ts), shared by
// `GET /api/watch-together/[userId]/picks` and `POST /api/decide`, so both
// build the pool the same way (spec §5.6: "same code as /picks").

import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { createLimiter } from "@/lib/concurrency";
import { genreIdsFromJson } from "@/lib/traits";
import type { MoodCandidate } from "@/lib/moodPicker";
import type { PoolEntry, PoolFetchers, PoolPerson } from "@/lib/pairPool";

// TMDB calls in flight at once for one request (spec §6, F1). The per-request
// caps on how many calls are made at all live in lib/pairPool.ts.
const TMDB_CONCURRENCY = 6;

/**
 * Log a failed TMDB call without leaking the API key, in case an error message
 * ever includes the request URL (same redaction as the mood picker).
 */
export function warnPoolFetchFailed(what: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Pair picks: ${what} failed: ${message.replace(/api_key=[^&\s]+/g, "api_key=***")}`);
}

/** One person's name, saved services and both watchlists, as pool input. */
export async function loadPoolPerson(userId: string): Promise<{ name: string | null; person: PoolPerson }> {
  const [user, movies, shows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, streamingServices: true } }),
    prisma.watchlistEntry.findMany({
      where: { userId },
      select: {
        movieId: true, status: true, rating: true, addedAt: true,
        movie: { select: { title: true, posterPath: true, releaseDate: true, overview: true, genres: true } },
      },
    }),
    prisma.tVWatchlistEntry.findMany({
      where: { userId },
      select: {
        tvShowId: true, status: true, rating: true, addedAt: true,
        tvShow: { select: { name: true, posterPath: true, firstAirDate: true, overview: true, genres: true } },
      },
    }),
  ]);
  const entries: PoolEntry[] = [
    ...movies.map((e): PoolEntry => ({
      mediaType: "movie",
      tmdbId: e.movieId,
      status: e.status,
      rating: e.rating,
      addedAt: e.addedAt.getTime(),
      title: e.movie.title,
      posterPath: e.movie.posterPath,
      date: e.movie.releaseDate,
      overview: e.movie.overview,
      genreIds: genreIdsFromJson(e.movie.genres),
    })),
    ...shows.map((e): PoolEntry => ({
      mediaType: "tv",
      tmdbId: e.tvShowId,
      status: e.status,
      rating: e.rating,
      addedAt: e.addedAt.getTime(),
      title: e.tvShow.name,
      posterPath: e.tvShow.posterPath,
      date: e.tvShow.firstAirDate,
      overview: e.tvShow.overview,
      genreIds: genreIdsFromJson(e.tvShow.genres),
    })),
  ];
  return { name: user?.name ?? null, person: { entries, providerIds: user?.streamingServices ?? [] } };
}

/** TMDB fetchers for one request, sharing one concurrency limiter. */
export function createPoolFetchers(): PoolFetchers {
  const limit = createLimiter(TMDB_CONCURRENCY);
  return {
    facts: (media, tmdbId) => limit(() => tmdb.getTitleMoodFacts(media, tmdbId)),
    recommendations: (media, tmdbId) =>
      limit(async (): Promise<MoodCandidate[]> =>
        media === "movie"
          ? ((await tmdb.getMovieRecommendations(tmdbId)).results ?? []).map((m) => ({
              id: m.id, mediaType: "movie", title: m.title, posterPath: m.poster_path,
              date: m.release_date, overview: m.overview, popularity: m.popularity,
              voteAverage: m.vote_average, voteCount: m.vote_count, genreIds: m.genre_ids, originalLanguage: m.original_language,
            }))
          : ((await tmdb.getTVRecommendations(tmdbId)).results ?? []).map((s) => ({
              id: s.id, mediaType: "tv", title: s.name, posterPath: s.poster_path,
              date: s.first_air_date, overview: s.overview, popularity: s.popularity,
              voteAverage: s.vote_average, voteCount: s.vote_count, genreIds: s.genre_ids, originalLanguage: s.original_language,
            }))
      ),
    discover: (media, discoverParams, page) =>
      limit(async () => {
        if (media === "movie") {
          const d = await tmdb.discover("movie", discoverParams, page);
          return {
            total: d.total_results,
            candidates: (d.results ?? []).map((m): MoodCandidate => ({
              id: m.id, mediaType: "movie", title: m.title, posterPath: m.poster_path,
              date: m.release_date, overview: m.overview, popularity: m.popularity,
              voteAverage: m.vote_average, voteCount: m.vote_count, genreIds: m.genre_ids, originalLanguage: m.original_language,
            })),
          };
        }
        const d = await tmdb.discover("tv", discoverParams, page);
        return {
          total: d.total_results,
          candidates: (d.results ?? []).map((s): MoodCandidate => ({
            id: s.id, mediaType: "tv", title: s.name, posterPath: s.poster_path,
            date: s.first_air_date, overview: s.overview, popularity: s.popularity,
            voteAverage: s.vote_average, voteCount: s.vote_count, genreIds: s.genre_ids, originalLanguage: s.original_language,
          })),
        };
      }),
  };
}
