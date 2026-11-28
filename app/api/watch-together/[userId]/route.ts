import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireConnection } from "@/lib/connections";
import { idSchema } from "@/lib/decide";
import { buildShelves, type ShelfEntry } from "@/lib/watchTogetherShelves";

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

async function loadEntries(userId: string): Promise<ShelfEntry[]> {
  const [movies, shows] = await Promise.all([
    prisma.watchlistEntry.findMany({
      where: { userId },
      select: {
        movieId: true, status: true, rating: true, addedAt: true,
        movie: { select: { title: true, posterPath: true, releaseDate: true } },
      },
    }),
    prisma.tVWatchlistEntry.findMany({
      where: { userId },
      select: {
        tvShowId: true, status: true, rating: true, addedAt: true,
        tvShow: { select: { name: true, posterPath: true, firstAirDate: true } },
      },
    }),
  ]);
  return [
    ...movies.map((e): ShelfEntry => ({
      mediaType: "movie", tmdbId: e.movieId, status: e.status, rating: e.rating,
      addedAt: e.addedAt.getTime(), title: e.movie.title, posterPath: e.movie.posterPath,
      date: e.movie.releaseDate,
    })),
    ...shows.map((e): ShelfEntry => ({
      mediaType: "tv", tmdbId: e.tvShowId, status: e.status, rating: e.rating,
      addedAt: e.addedAt.getTime(), title: e.tvShow.name, posterPath: e.tvShow.posterPath,
      date: e.tvShow.firstAirDate,
    })),
  ];
}

/**
 * GET /api/watch-together/[userId] — the Watch Together shelves for the
 * signed-in user and a connected friend, movies and TV alike.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const myId = session.user.id as string;

  // 404 (not 403) for a malformed id, no such user and not connected alike, so ids can't be probed.
  const id = idSchema.safeParse((await params).userId);
  if (!id.success) return notFound();
  const friendId = id.data;
  if (!(await requireConnection(myId, friendId))) return notFound();

  const [mine, theirs, friend] = await Promise.all([
    loadEntries(myId),
    loadEntries(friendId),
    prisma.user.findUnique({ where: { id: friendId }, select: { name: true } }),
  ]);

  const shelves = buildShelves(mine, theirs);

  // { id, name } only: the friend's email is never returned (spec §5.5, F7).
  return NextResponse.json({
    friend: { id: friendId, name: friend?.name ?? null },
    ...shelves,
  });
}
