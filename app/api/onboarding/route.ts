import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id as string;

  const { movieIds, skipped } = await req.json();

  if (!skipped && Array.isArray(movieIds) && movieIds.length > 0) {
    // Bulk-create watchlist entries for selected movies
    await Promise.allSettled(
      movieIds.map(async (movieId: number) => {
        // Ensure movie exists in DB
        let movie = await prisma.movie.findUnique({ where: { id: movieId } });
        if (!movie) {
          const tmdbMovie = await tmdb.getMovieDetails(movieId);
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
