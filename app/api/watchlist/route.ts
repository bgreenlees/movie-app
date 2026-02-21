import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status") || "WANT_TO_WATCH";

    const entries = await prisma.watchlistEntry.findMany({
      where: {
        userId: session.user.id,
        status: status as any,
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

    const { movieId, status, platform, watchType, rating, review } = await req.json();

    if (!movieId) {
      return NextResponse.json(
        { error: "Movie ID is required" },
        { status: 400 }
      );
    }

    // Validate rating if provided
    if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
      return NextResponse.json(
        { error: "Rating must be between 1 and 5" },
        { status: 400 }
      );
    }

    // Check if movie already exists in user's watchlist
    const existingEntry = await prisma.watchlistEntry.findUnique({
      where: {
        userId_movieId: {
          userId: session.user.id,
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
        userId: session.user.id,
        movieId: movieId,
        status: status || "WANT_TO_WATCH",
        platform: platform || null,
        watchType: watchType || null,
        rating: rating || null,
        review: review || null,
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
