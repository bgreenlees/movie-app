import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const genreId = req.nextUrl.searchParams.get("genreId");
    if (!genreId) {
      return NextResponse.json({ error: "genreId required" }, { status: 400 });
    }
    const id = parseInt(genreId);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Invalid genreId" }, { status: 400 });
    }
    const data = await tmdb.discoverTVByGenreSingle(id);
    return NextResponse.json({ results: (data.results || []).filter((s) => s.poster_path) });
  } catch (error) {
    console.error("Discover TV error:", error);
    return NextResponse.json({ error: "Discover failed" }, { status: 500 });
  }
}
