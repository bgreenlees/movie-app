import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const tvId = parseInt(id);

    if (isNaN(tvId)) {
      return NextResponse.json({ error: "Invalid TV show ID" }, { status: 400 });
    }

    const data = await tmdb.getTVVideos(tvId);

    const videos = data.results.filter((v) => v.site === "YouTube");

    // Prefer official trailer, then any trailer, then teaser
    const trailer =
      videos.find((v) => v.type === "Trailer" && v.official) ||
      videos.find((v) => v.type === "Trailer") ||
      videos.find((v) => v.type === "Teaser") ||
      null;

    return NextResponse.json({ key: trailer?.key || null });
  } catch (error) {
    console.error("Trailer fetch error:", error);
    return NextResponse.json({ key: null });
  }
}
