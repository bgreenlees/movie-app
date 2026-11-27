import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { limitByIp } from "@/lib/apiGuard";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const limited = limitByIp(request);
  if (limited) return limited;

  const { id } = await params;
  const tvId = parseInt(id);

  if (isNaN(tvId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const data = await tmdb.getTVWatchProviders(tvId);
    const us = data.results?.US;
    return NextResponse.json({
      flatrate: us?.flatrate || [],
      rent: us?.rent || [],
      buy: us?.buy || [],
    });
  } catch {
    return NextResponse.json({ flatrate: [], rent: [], buy: [] });
  }
}
