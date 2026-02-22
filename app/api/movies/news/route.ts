import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";

export async function GET() {
  const session = await auth();

  // Get user's saved streaming services (if logged in)
  let providerIds: number[] = [];
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id as string },
      select: { streamingServices: true },
    });
    providerIds = user?.streamingServices ?? [];
  }

  const [streamingRes, trendingRes, upcomingRes, nowPlayingRes] =
    await Promise.allSettled([
      tmdb.getNewOnStreaming(providerIds.length > 0 ? providerIds : undefined),
      tmdb.getTrending(),
      tmdb.getUpcoming(),
      tmdb.getNowPlaying(),
    ]);

  return NextResponse.json({
    newOnStreaming:
      streamingRes.status === "fulfilled"
        ? (streamingRes.value.results || []).filter((m) => m.poster_path)
        : [],
    trending:
      trendingRes.status === "fulfilled"
        ? (trendingRes.value.results || []).filter((m) => m.poster_path)
        : [],
    comingSoon:
      upcomingRes.status === "fulfilled"
        ? (upcomingRes.value.results || []).filter((m) => m.poster_path)
        : [],
    nowPlaying:
      nowPlayingRes.status === "fulfilled"
        ? (nowPlayingRes.value.results || []).filter((m) => m.poster_path)
        : [],
    personalizedStreaming: providerIds.length > 0,
  });
}
