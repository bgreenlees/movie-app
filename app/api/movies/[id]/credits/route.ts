import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const movieId = parseInt(id);

    if (isNaN(movieId)) {
      return NextResponse.json({ error: "Invalid movie ID" }, { status: 400 });
    }

    const apiKey = process.env.TMDB_API_KEY;
    const baseUrl = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
    const url = `${baseUrl}/movie/${movieId}?append_to_response=credits&api_key=${apiKey}`;

    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) throw new Error("TMDB API error");

    const data = await response.json();

    return NextResponse.json({
      tagline: data.tagline || null,
      overview: data.overview || null,
      poster_path: data.poster_path || null,
      release_date: data.release_date || null,
      cast: (data.credits?.cast || []).slice(0, 8),
      crew: data.credits?.crew || [],
    });
  } catch (error) {
    console.error("Credits fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch credits" }, { status: 500 });
  }
}
