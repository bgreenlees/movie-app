import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { limitByIp } from "@/lib/apiGuard";

export async function GET(req: NextRequest) {
  const limited = limitByIp(req);
  if (limited) return limited;

  try {
    const searchParams = req.nextUrl.searchParams;
    const page = searchParams.get("page") || "1";

    const results = await tmdb.getPopularMovies(parseInt(page));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Popular movies error:", error);
    return NextResponse.json(
      { error: "Failed to fetch popular movies" },
      { status: 500 }
    );
  }
}
