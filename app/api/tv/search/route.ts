import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    const data = await tmdb.searchTVShows(query, page);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
