import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import type { TMDBTVShow } from "@/lib/tmdb";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id as string;

  // All rated TV entries with genre data
  const ratedEntries = await prisma.tVWatchlistEntry.findMany({
    where: { userId, rating: { not: null } },
    include: { tvShow: { select: { genres: true } } },
    orderBy: { rating: "desc" },
  });

  const positiveEntries = ratedEntries.filter((e) => (e.rating ?? 0) >= 2);
  const negativeEntries = ratedEntries.filter((e) => (e.rating ?? 0) === 1);

  if (positiveEntries.length === 0) {
    // No ratings yet — fall back to trending TV
    const trending = await tmdb.getTrendingTV();
    return NextResponse.json({
      results: (trending.results || []).filter((s) => s.poster_path).slice(0, 40),
      personalized: false,
    });
  }

  // Build weighted genre preference map
  const genreScores: Record<number, number> = {};
  for (const entry of positiveEntries) {
    const weight = entry.rating === 3 ? 3 : 1;
    const genres = (entry.tvShow?.genres as Array<{ id: number }> | null) ?? [];
    for (const g of genres) {
      genreScores[g.id] = (genreScores[g.id] ?? 0) + weight;
    }
  }

  const topGenres = Object.entries(genreScores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([id]) => Number(id));

  const negativeGenreIds = new Set<number>();
  for (const entry of negativeEntries) {
    const genres = (entry.tvShow?.genres as Array<{ id: number }> | null) ?? [];
    genres.forEach((g) => negativeGenreIds.add(g.id));
  }

  // All TV show IDs to exclude
  const allEntries = await prisma.tVWatchlistEntry.findMany({
    where: { userId },
    select: { tvShowId: true },
  });
  const excludeIds = new Set(allEntries.map((e) => e.tvShowId));

  const topSeeds = positiveEntries.slice(0, 15);

  const [recResults, similarResults, hiddenGems] = await Promise.all([
    // Track A: TMDB TV recommendations
    Promise.allSettled(
      topSeeds.map((entry) =>
        tmdb.getTVRecommendations(entry.tvShowId).then((data) => ({
          weight: entry.rating === 3 ? 3 : 1,
          shows: (data.results || []).filter((s) => s.poster_path),
        }))
      )
    ),
    // Track B: TMDB similar TV shows
    Promise.allSettled(
      topSeeds.slice(0, 10).map((entry) =>
        tmdb.getSimilarTVShows(entry.tvShowId).then((data) => ({
          weight: entry.rating === 3 ? 2 : 1,
          shows: (data.results || []).filter((s) => s.poster_path),
        }))
      )
    ),
    // Track C: Hidden gem TV in user's top genres
    topGenres.length > 0
      ? tmdb.discoverHiddenGemTV(topGenres).then((data) =>
          (data.results || []).filter((s) => s.poster_path)
        )
      : Promise.resolve([] as TMDBTVShow[]),
  ]);

  const scores: Record<number, number> = {};
  const showMap: Record<number, TMDBTVShow> = {};

  for (const result of recResults) {
    if (result.status !== "fulfilled") continue;
    for (const show of result.value.shows) {
      if (excludeIds.has(show.id)) continue;
      scores[show.id] = (scores[show.id] ?? 0) + result.value.weight;
      showMap[show.id] = show;
    }
  }

  for (const result of similarResults) {
    if (result.status !== "fulfilled") continue;
    for (const show of result.value.shows) {
      if (excludeIds.has(show.id)) continue;
      scores[show.id] = (scores[show.id] ?? 0) + result.value.weight * 0.7;
      showMap[show.id] = show;
    }
  }

  for (const show of hiddenGems) {
    if (excludeIds.has(show.id)) continue;
    scores[show.id] = (scores[show.id] ?? 0) + 1.5;
    showMap[show.id] = show;
  }

  for (const idStr of Object.keys(scores)) {
    const id = Number(idStr);
    const show = showMap[id];
    if (!show) continue;

    if (show.vote_average >= 7.0 && show.vote_count >= 100 && show.vote_count < 3000) {
      scores[id] += 2;
    }

    const showGenres = show.genre_ids ?? [];
    const negativeOverlap = showGenres.filter((g) => negativeGenreIds.has(g)).length;
    if (negativeOverlap > 0) {
      scores[id] -= negativeOverlap * 0.5;
    }
  }

  const ranked = Object.entries(scores)
    .sort(([idA, a], [idB, b]) =>
      a !== b
        ? b - a
        : (showMap[Number(idB)]?.popularity ?? 0) - (showMap[Number(idA)]?.popularity ?? 0)
    )
    .slice(0, 50)
    .map(([id]) => showMap[Number(id)])
    .filter(Boolean);

  return NextResponse.json({ results: ranked, personalized: true });
}
