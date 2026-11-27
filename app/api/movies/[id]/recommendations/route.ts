import { NextRequest, NextResponse } from "next/server";
import { tmdb, type TMDBMovie } from "@/lib/tmdb";
import { requireSession } from "@/lib/apiGuard";

const MIN_RECS = 6;
const MAX_RETURN = 12;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const { id } = await params;
    const movieId = parseInt(id);

    if (isNaN(movieId)) {
      return NextResponse.json({ error: "Invalid movie ID" }, { status: 400 });
    }

    const recs = await tmdb.getMovieRecommendations(movieId);
    const results: TMDBMovie[] = (recs.results || []).filter((m) => m.poster_path);

    if (results.length < MIN_RECS) {
      const similar = await tmdb.getSimilarMovies(movieId);
      const seen = new Set(results.map((m) => m.id));
      for (const m of similar.results || []) {
        if (!seen.has(m.id) && m.poster_path) {
          results.push(m);
          seen.add(m.id);
        }
      }
    }

    return NextResponse.json({ results: results.slice(0, MAX_RETURN) });
  } catch (error) {
    console.error("Movie recommendations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
