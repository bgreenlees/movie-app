import { NextRequest, NextResponse } from "next/server";
import { tmdb, type TMDBTVShow } from "@/lib/tmdb";

const MIN_RECS = 6;
const MAX_RETURN = 12;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tvId = parseInt(id);

    if (isNaN(tvId)) {
      return NextResponse.json({ error: "Invalid TV show ID" }, { status: 400 });
    }

    const recs = await tmdb.getTVRecommendations(tvId);
    let results: TMDBTVShow[] = (recs.results || []).filter((s) => s.poster_path);

    if (results.length < MIN_RECS) {
      const similar = await tmdb.getSimilarTVShows(tvId);
      const seen = new Set(results.map((s) => s.id));
      for (const s of similar.results || []) {
        if (!seen.has(s.id) && s.poster_path) {
          results.push(s);
          seen.add(s.id);
        }
      }
    }

    return NextResponse.json({ results: results.slice(0, MAX_RETURN) });
  } catch (error) {
    console.error("TV recommendations error:", error);
    return NextResponse.json(
      { error: "Failed to fetch recommendations" },
      { status: 500 }
    );
  }
}
