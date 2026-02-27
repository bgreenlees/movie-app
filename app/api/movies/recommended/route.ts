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

  // All rated entries + movie genre data for preference extraction
  const ratedEntries = await prisma.watchlistEntry.findMany({
    where: { userId, rating: { not: null } },
    include: { movie: { select: { genres: true } } },
    orderBy: { rating: "desc" },
  });

  const positiveEntries = ratedEntries.filter((e) => (e.rating ?? 0) >= 2); // 👍 or ❤️
  const negativeEntries = ratedEntries.filter((e) => (e.rating ?? 0) === 1); // 👎

  if (positiveEntries.length === 0) {
    return NextResponse.json({ results: [], personalized: false });
  }

  // Build weighted genre preference map from positive ratings
  const genreScores: Record<number, number> = {};
  for (const entry of positiveEntries) {
    const weight = entry.rating === 3 ? 3 : 1;
    const genres = (entry.movie?.genres as Array<{ id: number }> | null) ?? [];
    for (const g of genres) {
      genreScores[g.id] = (genreScores[g.id] ?? 0) + weight;
    }
  }

  // Top 3 genres drive hidden gem discovery
  const topGenres = Object.entries(genreScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id]) => Number(id));

  // Genre IDs to penalise (from 👎 ratings)
  const negativeGenreIds = new Set<number>();
  for (const entry of negativeEntries) {
    const genres = (entry.movie?.genres as Array<{ id: number }> | null) ?? [];
    genres.forEach((g) => negativeGenreIds.add(g.id));
  }

  // All watchlist movie IDs to exclude from results
  const allEntries = await prisma.watchlistEntry.findMany({
    where: { userId },
    select: { movieId: true },
  });
  const excludeIds = new Set(allEntries.map((e) => e.movieId));

  // Cap TMDB calls at 15 seeds (diminishing returns beyond that)
  const topSeeds = positiveEntries.slice(0, 15);

  // Three parallel tracks
  const [recResults, similarResults, hiddenGems] = await Promise.all([
    // Track A: TMDB collaborative recommendations (popularity-leaning)
    Promise.allSettled(
      topSeeds.map((entry) =>
        tmdb.getMovieRecommendations(entry.movieId).then((data) => ({
          weight: entry.rating === 3 ? 3 : 1,
          movies: (data.results || []).filter((m) => m.poster_path),
        }))
      )
    ),
    // Track B: TMDB similar (genre/keyword based — meaningfully different pool)
    Promise.allSettled(
      topSeeds.slice(0, 10).map((entry) =>
        tmdb.getSimilarMovies(entry.movieId).then((data) => ({
          weight: entry.rating === 3 ? 2 : 1,
          movies: (data.results || []).filter((m) => m.poster_path),
        }))
      )
    ),
    // Track C: Hidden gems — quality films with low vote counts in user's top genres
    topGenres.length > 0
      ? tmdb.discoverHiddenGems(topGenres).then((data) =>
          (data.results || []).filter((m) => m.poster_path)
        )
      : Promise.resolve([] as TMDBMovie[]),
  ]);

  const scores: Record<number, number> = {};
  const movieMap: Record<number, TMDBMovie> = {};

  // Score Track A
  for (const result of recResults) {
    if (result.status !== "fulfilled") continue;
    for (const movie of result.value.movies) {
      if (excludeIds.has(movie.id)) continue;
      scores[movie.id] = (scores[movie.id] ?? 0) + result.value.weight;
      movieMap[movie.id] = movie;
    }
  }

  // Score Track B (slightly discounted — supplementary signal)
  for (const result of similarResults) {
    if (result.status !== "fulfilled") continue;
    for (const movie of result.value.movies) {
      if (excludeIds.has(movie.id)) continue;
      scores[movie.id] = (scores[movie.id] ?? 0) + result.value.weight * 0.7;
      movieMap[movie.id] = movie;
    }
  }

  // Score Track C — base score ensures hidden gems surface even without overlap
  for (const movie of hiddenGems) {
    if (excludeIds.has(movie.id)) continue;
    scores[movie.id] = (scores[movie.id] ?? 0) + 1.5;
    movieMap[movie.id] = movie;
  }

  // Apply bonuses and penalties
  for (const idStr of Object.keys(scores)) {
    const id = Number(idStr);
    const movie = movieMap[id];
    if (!movie) continue;

    // Hidden gem bonus: critically good, not widely seen
    if (movie.vote_average >= 7.0 && movie.vote_count >= 150 && movie.vote_count < 3000) {
      scores[id] += 2;
    }

    // Negative genre penalty per overlapping disliked genre
    const movieGenres = movie.genre_ids ?? [];
    const negativeOverlap = movieGenres.filter((g) => negativeGenreIds.has(g)).length;
    if (negativeOverlap > 0) {
      scores[id] -= negativeOverlap * 0.5;
    }
  }

  // Sort by final score, popularity as tiebreaker
  const ranked = Object.entries(scores)
    .sort(([idA, a], [idB, b]) =>
      a !== b
        ? b - a
        : (movieMap[Number(idB)]?.popularity ?? 0) - (movieMap[Number(idA)]?.popularity ?? 0)
    )
    .slice(0, 50)
    .map(([id]) => movieMap[Number(id)])
    .filter(Boolean);

  return NextResponse.json({ results: ranked, personalized: true });
}
