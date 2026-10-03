import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { fuzzySearch } from "@/lib/fuzzySearch";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const page = parseInt(searchParams.get("page") || "1");

  if (!query) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  try {
    const data = await tmdb.searchTVShows(query, page);

    // Nothing matched exactly — likely a typo, so try looser variants.
    if (!data.results?.length && page === 1) {
      const fuzzy = await fuzzySearch(query, (q) => tmdb.searchTVShows(q), (s) => s.name);
      if (fuzzy.results.length) {
        return NextResponse.json({ ...data, results: fuzzy.results, suggestion: fuzzy.suggestion, fuzzy: true });
      }
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
