import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { limitByIp } from "@/lib/apiGuard";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = limitByIp(req);
  if (limited) return limited;

  try {
    const { id } = await params;
    const movieId = parseInt(id);

    if (isNaN(movieId)) {
      return NextResponse.json({ error: "Invalid movie ID" }, { status: 400 });
    }

    const data = await tmdb.getWatchProviders(movieId);
    const us = data.results?.US || {};

    return NextResponse.json({
      flatrate: us.flatrate || [],
      rent: us.rent || [],
      buy: us.buy || [],
    });
  } catch (error) {
    console.error("Watch providers error:", error);
    return NextResponse.json({ flatrate: [], rent: [], buy: [] });
  }
}
