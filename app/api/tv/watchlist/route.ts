import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id as string;
    const status = req.nextUrl.searchParams.get("status");

    const entries = await prisma.tVWatchlistEntry.findMany({
      where: {
        userId,
        ...(status ? { status: status as any } : {}),
      },
      include: { tvShow: true },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("TV watchlist fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch TV watchlist" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id as string;
    const { tvShowId, status, platform, rating, review, currentSeason, currentEpisode } = await req.json();

    if (!tvShowId) return NextResponse.json({ error: "TV Show ID is required" }, { status: 400 });

    // Upsert TV show in DB
    let tvShow = await prisma.tVShow.findUnique({ where: { id: tvShowId } });
    if (!tvShow) {
      const tmdbShow = await tmdb.getTVShowDetails(tvShowId);
      tvShow = await prisma.tVShow.create({
        data: {
          id: tmdbShow.id,
          name: tmdbShow.name,
          posterPath: tmdbShow.poster_path,
          firstAirDate: tmdbShow.first_air_date,
          overview: tmdbShow.overview,
          genres: tmdbShow.genres,
        },
      });
    }

    // Upsert watchlist entry (allow updating if already exists)
    const entry = await prisma.tVWatchlistEntry.upsert({
      where: { userId_tvShowId: { userId, tvShowId } },
      create: {
        userId,
        tvShowId,
        status: status || "WANT_TO_WATCH",
        platform: platform || null,
        rating: rating || null,
        review: review || null,
        currentSeason: currentSeason || null,
        currentEpisode: currentEpisode || null,
      },
      update: {
        status: status || "WANT_TO_WATCH",
        platform: platform || null,
        rating: rating || null,
        review: review || null,
        currentSeason: currentSeason || null,
        currentEpisode: currentEpisode || null,
      },
      include: { tvShow: true },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("TV watchlist add error:", error);
    return NextResponse.json({ error: "Failed to add TV show to watchlist" }, { status: 500 });
  }
}
