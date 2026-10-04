import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { canonicalProviderIds, providerTierIds } from "@/lib/providers";
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb";

export interface NewsItem {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  date: string;
  overview: string;
  popularity: number;
}

export interface ServiceRow {
  id: number;
  name: string;
  logoPath: string | null;
  items: NewsItem[];
}

function fromMovies(res: PromiseSettledResult<{ results: TMDBMovie[] }>): NewsItem[] {
  if (res.status !== "fulfilled") return [];
  return (res.value.results || [])
    .filter((m) => m.poster_path)
    .map((m) => ({
      id: m.id,
      mediaType: "movie",
      title: m.title,
      posterPath: m.poster_path,
      date: m.release_date,
      overview: m.overview,
      popularity: m.popularity,
    }));
}

function fromTV(res: PromiseSettledResult<{ results: TMDBTVShow[] }>): NewsItem[] {
  if (res.status !== "fulfilled") return [];
  return (res.value.results || [])
    .filter((s) => s.poster_path)
    .map((s) => ({
      id: s.id,
      mediaType: "tv",
      title: s.name,
      posterPath: s.poster_path,
      date: s.first_air_date,
      overview: s.overview,
      popularity: s.popularity,
    }));
}

export async function GET() {
  const session = await auth();

  // Get user's saved streaming services (if logged in)
  let providerIds: number[] = [];
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id as string },
      select: { streamingServices: true },
    });
    providerIds = canonicalProviderIds(user?.streamingServices ?? []);
  }

  // One row per saved service; without saved services, a single combined row
  const rowSpecs = providerIds.length > 0 ? providerIds.map(providerTierIds) : [undefined];

  const [providersRes, rowResults, otherResults] = await Promise.all([
    Promise.allSettled([tmdb.getAvailableProviders()]),
    Promise.all(
      rowSpecs.map((ids) =>
        Promise.allSettled([tmdb.getNewOnStreaming(ids), tmdb.getNewOnStreamingTV(ids)])
      )
    ),
    Promise.allSettled([
      tmdb.getNewToRentOrBuy(),
      tmdb.getTrending(),
      tmdb.getTrendingTV(),
      tmdb.getUpcoming(),
      tmdb.getNowPlaying(),
      tmdb.getOnTheAirTV(),
    ]),
  ]);

  const providers = providersRes[0].status === "fulfilled" ? providersRes[0].value : [];
  const services: ServiceRow[] = rowResults.map(([movieRes, tvRes], i) => {
    const id = rowSpecs[i]?.[0] ?? 0;
    const provider = providers.find((p) => p.provider_id === id);
    return {
      id,
      name: provider?.provider_name ?? "Streaming",
      logoPath: provider?.logo_path ?? null,
      items: [...fromMovies(movieRes), ...fromTV(tvRes)],
    };
  });

  const [rentBuyRes, trendingRes, trendingTVRes, upcomingRes, nowPlayingRes, onTheAirRes] =
    otherResults;

  return NextResponse.json({
    services,
    rentOrBuy: fromMovies(rentBuyRes),
    trending: [...fromMovies(trendingRes), ...fromTV(trendingTVRes)],
    comingSoon: fromMovies(upcomingRes),
    nowPlaying: fromMovies(nowPlayingRes),
    airingNow: fromTV(onTheAirRes),
    personalizedStreaming: providerIds.length > 0,
  });
}
