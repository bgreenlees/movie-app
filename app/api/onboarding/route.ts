import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { createLimiter } from "@/lib/concurrency";
import { parseOnboardingIds } from "@/lib/onboarding";

// TMDB detail lookups in flight at once for one request (same reasoning as mood-picks).
const TMDB_CONCURRENCY = 5;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;

  const body = await req.json().catch(() => null);
  const skipped = body?.skipped === true;
  // Only curated ids, at most 40: anything else would let one request trigger
  // unbounded TMDB calls and database writes (security audit F2).
  const movieIds = skipped ? [] : parseOnboardingIds(body?.movieIds ?? []);
  if (movieIds === null) {
    return NextResponse.json({ error: "Invalid movieIds" }, { status: 400 });
  }

  if (movieIds.length > 0) {
    const limit = createLimiter(TMDB_CONCURRENCY);
    // Bulk-create watchlist entries for selected movies
    await Promise.allSettled(
      movieIds.map(async (movieId) => {
        // Ensure movie exists in DB
        let movie = await prisma.movie.findUnique({ where: { id: movieId } });
        if (!movie) {
          const tmdbMovie = await limit(() => tmdb.getMovieDetails(movieId));
          movie = await prisma.movie.create({
            data: {
              id: tmdbMovie.id,
              title: tmdbMovie.title,
              posterPath: tmdbMovie.poster_path,
              releaseDate: tmdbMovie.release_date,
              overview: tmdbMovie.overview,
              genres: tmdbMovie.genres,
            },
          });
        }

        // Create entry — skip silently if it already exists
        await prisma.watchlistEntry.upsert({
          where: { userId_movieId: { userId, movieId } },
          create: {
            userId,
            movieId,
            status: "WATCHED",
            rating: 3,
            watchedAt: new Date(),
          },
          update: { rating: 3, status: "WATCHED" },
        });
      })
    );
  }

  // Mark onboarding complete regardless of skip
  await prisma.user.update({
    where: { id: userId },
    data: { hasCompletedOnboarding: true },
  });

  return NextResponse.json({ ok: true });
}
