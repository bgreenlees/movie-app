import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tvId = parseInt(id);

  if (isNaN(tvId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const details = await tmdb.getTVShowDetails(tvId);

    // Most recent non-special season (season_number > 0)
    const mainSeasons = (details.seasons || []).filter((s) => s.season_number > 0);
    const latestSeason = mainSeasons.at(-1) ?? null;

    return NextResponse.json({
      latestSeason: latestSeason
        ? { number: latestSeason.season_number, premiereDate: latestSeason.air_date }
        : null,
      lastAirDate: details.last_air_date ?? null,
      status: details.status,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch TV info" }, { status: 500 });
  }
}
