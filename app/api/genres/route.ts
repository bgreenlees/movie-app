import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiGuard";
import { tmdb } from "@/lib/tmdb";

// Genre id → name map, used by the results filter bar to label genre chips.
export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;
  try {
    const media = req.nextUrl.searchParams.get("media") === "tv" ? "tv" : "movie";
    const genres = media === "tv" ? await tmdb.getTVGenres() : await tmdb.getMovieGenres();
    const names: Record<number, string> = {};
    for (const g of genres) names[g.id] = g.name;
    return NextResponse.json(
      { genres: names },
      { headers: { "Cache-Control": "public, max-age=86400" } }
    );
  } catch (error) {
    console.error("Genres fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch genres" }, { status: 500 });
  }
}
