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
    const [details, credits] = await Promise.all([
      tmdb.getTVShowDetails(tvId),
      tmdb.getTVCredits(tvId),
    ]);

    return NextResponse.json({
      tagline: details.tagline,
      overview: details.overview,
      poster_path: details.poster_path,
      status: details.status,
      first_air_date: details.first_air_date,
      last_air_date: details.last_air_date,
      number_of_seasons: details.number_of_seasons,
      number_of_episodes: details.number_of_episodes,
      next_episode_to_air: details.next_episode_to_air,
      seasons: details.seasons,
      networks: details.networks,
      cast: (credits.cast || []).slice(0, 8),
      crew: credits.crew || [],
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch TV details" }, { status: 500 });
  }
}
