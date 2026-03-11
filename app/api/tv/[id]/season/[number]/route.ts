import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; number: string }> }
) {
  const { id, number } = await params;
  const tvId = parseInt(id);
  const seasonNumber = parseInt(number);

  if (isNaN(tvId) || isNaN(seasonNumber)) {
    return NextResponse.json({ error: "Invalid ID or season number" }, { status: 400 });
  }

  try {
    const data = await tmdb.getTVSeasonDetails(tvId, seasonNumber);
    return NextResponse.json({ episodes: data.episodes || [] });
  } catch {
    return NextResponse.json({ error: "Failed to fetch season" }, { status: 500 });
  }
}
