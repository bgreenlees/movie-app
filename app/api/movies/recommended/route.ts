import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import type { TMDBMovie } from "@/lib/tmdb";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id as string;

  // Fetch all the user's watchlist entries that have a rating
  const ratedEntries = await prisma.watchlistEntry.findMany({
    where: { userId, rating: { gte: 2 } }, // 2 = like, 3 = love
    orderBy: { rating: "desc" },
    take: 10, // cap at 10 source movies to avoid too many TMDB calls
  });

  if (ratedEntries.length === 0) {
    return NextResponse.json({ results: [], personalized: false });
  }

  // Fetch all movie IDs already in the user's lists so we can filter them out
  const allEntries = await prisma.watchlistEntry.findMany({
    where: { userId },
    select: { movieId: true },
  });
  const excludeIds = new Set(allEntries.map((e) => e.movieId));

  // Fetch TMDB recommendations for each rated movie in parallel
  // Weight: love (3) = 2 points, like (2) = 1 point
  const scores: Record<number, number> = {};
  const movieMap: Record<number, TMDBMovie> = {};

  const results = await Promise.allSettled(
    ratedEntries.map((entry) =>
      tmdb.getMovieRecommendations(entry.movieId).then((data) => ({
        weight: entry.rating === 3 ? 2 : 1,
        movies: data.results || [],
      }))
    )
  );

  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const { weight, movies } = result.value;
    for (const movie of movies) {
      if (excludeIds.has(movie.id)) continue;
      if (!movie.poster_path) continue; // skip movies without posters
      scores[movie.id] = (scores[movie.id] || 0) + weight;
      movieMap[movie.id] = movie;
    }
  }

  // Sort by recommendation score descending, then by popularity
  const ranked = Object.entries(scores)
    .sort(([, a], [, b]) => b - a || (movieMap[Number(b)]?.popularity ?? 0) - (movieMap[Number(a)]?.popularity ?? 0))
    .slice(0, 40)
    .map(([id]) => movieMap[Number(id)]);

  return NextResponse.json({ results: ranked, personalized: true });
}
