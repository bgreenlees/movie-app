import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { fuzzySearch } from "@/lib/fuzzySearch";

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const query = searchParams.get("q");
    const page = searchParams.get("page") || "1";

    if (!query) {
      return NextResponse.json(
        { error: "Query parameter is required" },
        { status: 400 }
      );
    }

    const results = await tmdb.searchMovies(query, parseInt(page));

    // Nothing matched exactly — likely a typo, so try looser variants.
    if (!results.results?.length && page === "1") {
      const fuzzy = await fuzzySearch(query, (q) => tmdb.searchMovies(q), (m) => m.title);
      if (fuzzy.results.length) {
        return NextResponse.json({ ...results, results: fuzzy.results, suggestion: fuzzy.suggestion, fuzzy: true });
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Movie search error:", error);
    return NextResponse.json(
      { error: "Failed to search movies" },
      { status: 500 }
    );
  }
}
