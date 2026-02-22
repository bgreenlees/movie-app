import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import type { TMDBMovie } from "@/lib/tmdb";

export async function GET(req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const myId = session.user.id as string;
  const { userId: friendId } = await params;

  // Verify these two users are actually connected
  const connection = await prisma.userConnection.findFirst({
    where: {
      status: "ACCEPTED",
      OR: [
        { requesterId: myId, addresseeId: friendId },
        { requesterId: friendId, addresseeId: myId },
      ],
    },
  });
  if (!connection) return NextResponse.json({ error: "Not connected" }, { status: 403 });

  // Fetch both users' watchlist entries
  const [myEntries, friendEntries] = await Promise.all([
    prisma.watchlistEntry.findMany({
      where: { userId: myId },
      include: { movie: true },
    }),
    prisma.watchlistEntry.findMany({
      where: { userId: friendId },
      include: { movie: true },
    }),
  ]);

  const myMovieIds = new Set(myEntries.map((e) => e.movieId));
  const friendMovieIds = new Set(friendEntries.map((e) => e.movieId));
  const allSeenIds = new Set([...myMovieIds, ...friendMovieIds]);

  // Both want to watch
  const myWantIds = new Set(myEntries.filter((e) => e.status === "WANT_TO_WATCH").map((e) => e.movieId));
  const bothWantToWatch = friendEntries
    .filter((e) => e.status === "WANT_TO_WATCH" && myWantIds.has(e.movieId))
    .map((e) => e.movie);

  // Friend loved, I haven't seen
  const friendLovedForMe = friendEntries
    .filter((e) => (e.rating ?? 0) >= 2 && !myMovieIds.has(e.movieId))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 12)
    .map((e) => e.movie);

  // I loved, friend hasn't seen
  const iLovedForFriend = myEntries
    .filter((e) => (e.rating ?? 0) >= 2 && !friendMovieIds.has(e.movieId))
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 12)
    .map((e) => e.movie);

  // Fresh recommendations based on movies BOTH users liked
  const bothLikedIds = myEntries
    .filter((e) => (e.rating ?? 0) >= 2 && friendMovieIds.has(e.movieId))
    .filter((e) => {
      const friendEntry = friendEntries.find((f) => f.movieId === e.movieId);
      return (friendEntry?.rating ?? 0) >= 2;
    })
    .map((e) => e.movieId)
    .slice(0, 5);

  const scores: Record<number, number> = {};
  const movieMap: Record<number, TMDBMovie> = {};

  if (bothLikedIds.length > 0) {
    const recResults = await Promise.allSettled(
      bothLikedIds.map((id) => tmdb.getMovieRecommendations(id))
    );
    for (const result of recResults) {
      if (result.status !== "fulfilled") continue;
      for (const movie of result.value.results || []) {
        if (allSeenIds.has(movie.id) || !movie.poster_path) continue;
        scores[movie.id] = (scores[movie.id] || 0) + 1;
        movieMap[movie.id] = movie;
      }
    }
  }

  const freshPicks = Object.entries(scores)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([id]) => movieMap[Number(id)]);

  // Fetch friend info
  const friend = await prisma.user.findUnique({
    where: { id: friendId },
    select: { id: true, name: true, email: true },
  });

  return NextResponse.json({
    friend,
    bothWantToWatch,
    friendLovedForMe,
    iLovedForFriend,
    freshPicks,
  });
}
