import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireConnection } from "@/lib/connections";
import { tmdb } from "@/lib/tmdb";
import { createLimiter } from "@/lib/concurrency";
import { idSchema } from "@/lib/decide";
import { genreIdsFromJson } from "@/lib/traits";
import type { MoodCandidate } from "@/lib/moodPicker";
import { buildPairPool, parsePairPicksQuery, type PoolEntry, type PoolFetchers } from "@/lib/pairPool";

// TMDB calls in flight at once for this request (spec §6, F1). The per-request
// caps on how many calls are made at all live in lib/pairPool.ts.
const TMDB_CONCURRENCY = 6;

// Log a failed TMDB call without leaking the API key, in case an error message
// ever includes the request URL (same redaction as the mood picker).
function warnFailed(what: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Pair picks: ${what} failed: ${message.replace(/api_key=[^&\s]+/g, "api_key=***")}`);
}

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

async function loadPerson(userId: string) {
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

/**
 * GET /api/watch-together/[userId]/picks — "Tonight for you both" (spec §5.6).
 * A ranked pool of movies and TV for the signed-in user and a connected friend.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const myId = session.user.id;

    // 404 for a malformed id, no such user and not connected alike, so ids can't be probed.
    const id = idSchema.safeParse((await params).userId);
    if (!id.success) return notFound();
    const partnerId = id.data;
    if (!(await requireConnection(myId, partnerId))) return notFound();

    const query = parsePairPicksQuery(req.nextUrl.searchParams);
    if (!query.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });

    const [me, partner] = await Promise.all([loadPerson(myId), loadPerson(partnerId)]);

    const limit = createLimiter(TMDB_CONCURRENCY);
    const fetchers: PoolFetchers = {
      facts: (media, tmdbId) => limit(() => tmdb.getTitleMoodFacts(media, tmdbId)),
      recommendations: (media, tmdbId) =>
        limit(async (): Promise<MoodCandidate[]> =>
          media === "movie"
            ? ((await tmdb.getMovieRecommendations(tmdbId)).results ?? []).map((m) => ({
                id: m.id, mediaType: "movie", title: m.title, posterPath: m.poster_path,
                date: m.release_date, overview: m.overview, popularity: m.popularity,
                voteAverage: m.vote_average, voteCount: m.vote_count, genreIds: m.genre_ids,
              }))
            : ((await tmdb.getTVRecommendations(tmdbId)).results ?? []).map((s) => ({
                id: s.id, mediaType: "tv", title: s.name, posterPath: s.poster_path,
                date: s.first_air_date, overview: s.overview, popularity: s.popularity,
                voteAverage: s.vote_average, voteCount: s.vote_count, genreIds: s.genre_ids,
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
                voteAverage: m.vote_average, voteCount: m.vote_count, genreIds: m.genre_ids,
              })),
            };
          }
          const d = await tmdb.discover("tv", discoverParams, page);
          return {
            total: d.total_results,
            candidates: (d.results ?? []).map((s): MoodCandidate => ({
              id: s.id, mediaType: "tv", title: s.name, posterPath: s.poster_path,
              date: s.first_air_date, overview: s.overview, popularity: s.popularity,
              voteAverage: s.vote_average, voteCount: s.vote_count, genreIds: s.genre_ids,
            })),
          };
        }),
    };

    const result = await buildPairPool({
      me: me.person,
      partner: partner.person,
      partnerName: partner.name,
      selection: query.data.selection,
      sharedOnly: query.data.sharedOnly,
      today: new Date(),
      fetchers,
      onError: warnFailed,
    });
    if (result.discoverFailed && result.pool.length === 0) {
      return NextResponse.json({ error: "Failed to load picks" }, { status: 502 });
    }

    // Partner is { id, name } only: no email from new routes (§5.5, F7).
    return NextResponse.json({
      partner: { id: partnerId, name: partner.name },
      pool: result.pool,
      services: result.services,
      coldStart: result.coldStart,
      // Some TMDB calls failed: the UI can say "some picks couldn't load"
      partial: result.partial,
    });
  } catch (error) {
    console.error("Pair picks error:", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Failed to load picks" }, { status: 500 });
  }
}
