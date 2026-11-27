import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WatchStatus } from "@prisma/client";
import { tmdb } from "@/lib/tmdb";
import {
  firstError,
  parseEnum,
  parseId,
  parsePlatform,
  parseRating,
  parseReview,
  parseWatchType,
  readJsonObject,
} from "@/lib/validation";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "WANT_TO_WATCH";
    // Reject unknown statuses up front; passing an arbitrary string to Prisma
    // makes the query throw and surfaces as a 500 instead of a 400.
    if (!(Object.values(WatchStatus) as string[]).includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const entries = await prisma.watchlistEntry.findMany({
      where: {
        userId,
        status: status as WatchStatus,
      },
      include: {
        movie: true,
      },
      orderBy: {
        addedAt: "desc",
      },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Watchlist fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch watchlist" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id as string;
    const body = await readJsonObject(req);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: 400 });

    const movieIdResult = parseId(body.value.movieId, "movieId");
    const statusResult =
      body.value.status === undefined || body.value.status === null
        ? ({ ok: true, value: "WANT_TO_WATCH" } as const)
        : parseEnum(body.value.status, Object.values(WatchStatus), "status");
    const platformResult = parsePlatform(body.value.platform);
    const watchTypeResult = parseWatchType(body.value.watchType);
    const ratingResult = parseRating(body.value.rating);
    const reviewResult = parseReview(body.value.review);
    if (
      !movieIdResult.ok ||
      !statusResult.ok ||
      !platformResult.ok ||
      !watchTypeResult.ok ||
      !ratingResult.ok ||
      !reviewResult.ok
    ) {
      const error = firstError(
        movieIdResult,
        statusResult,
        platformResult,
        watchTypeResult,
        ratingResult,
        reviewResult
      );
      return NextResponse.json({ error }, { status: 400 });
    }
    const movieId = movieIdResult.value;
    const status = statusResult.value;

    // Check if movie already exists in user's watchlist
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: {
        userId_movieId: {
          userId,
          movieId: movieId,
        },
      },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: "Movie already in watchlist" },
        { status: 400 }
      );
    }

    // Fetch movie details from TMDB if not in database
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

    // Create watchlist entry
    const entry = await prisma.watchlistEntry.create({
      data: {
        userId,
        movieId: movieId,
        status,
        platform: platformResult.value,
        watchType: watchTypeResult.value,
        rating: ratingResult.value,
        review: reviewResult.value,
        watchedAt: status === "WATCHED" ? new Date() : null,
      },
      include: {
        movie: true,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("Add to watchlist error:", error);
    return NextResponse.json(
      { error: "Failed to add movie to watchlist" },
      { status: 500 }
    );
  }
}
