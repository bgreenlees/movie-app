import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { TVWatchStatus } from "@prisma/client";
import { tmdb } from "@/lib/tmdb";
import {
  parseEnum,
  parseId,
  parsePlatform,
  firstError,
  parseProgress,
  parseRating,
  parseReview,
  readJsonObject,
} from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = session.user.id as string;
    const status = req.nextUrl.searchParams.get("status");
    // Reject unknown statuses up front; passing an arbitrary string to Prisma
    // makes the query throw and surfaces as a 500 instead of a 400.
    if (status && !(Object.values(TVWatchStatus) as string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const entries = await prisma.tVWatchlistEntry.findMany({
      where: {
        userId,
        ...(status ? { status: status as TVWatchStatus } : {}),
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
    const body = await readJsonObject(req);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });
    const b = body.value;
    const tvShowIdResult = parseId(b.tvShowId, "tvShowId");
    const statusResult =
      b.status === undefined || b.status === null
        ? ({ ok: true, value: "WANT_TO_WATCH" } as const)
        : parseEnum(b.status, Object.values(TVWatchStatus), "status");
    const platform = parsePlatform(b.platform);
    const rating = parseRating(b.rating);
    const review = parseReview(b.review);
    const currentSeason = parseProgress(b.currentSeason, "currentSeason");
    const currentEpisode = parseProgress(b.currentEpisode, "currentEpisode");
    if (
      !tvShowIdResult.ok ||
      !statusResult.ok ||
      !platform.ok ||
      !rating.ok ||
      !review.ok ||
      !currentSeason.ok ||
      !currentEpisode.ok
    ) {
      const error = firstError(
        tvShowIdResult,
        statusResult,
        platform,
        rating,
        review,
        currentSeason,
        currentEpisode
      );
      return NextResponse.json({ error }, { status: 400 });
    }
    const tvShowId = tvShowIdResult.value;

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
        status: statusResult.value,
        platform: platform.value,
        rating: rating.value,
        review: review.value,
        currentSeason: currentSeason.value,
        currentEpisode: currentEpisode.value,
      },
      update: {
        status: statusResult.value,
        platform: platform.value,
        rating: rating.value,
        review: review.value,
        currentSeason: currentSeason.value,
        currentEpisode: currentEpisode.value,
      },
      include: { tvShow: true },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("TV watchlist add error:", error);
    return NextResponse.json({ error: "Failed to add TV show to watchlist" }, { status: 500 });
  }
}
