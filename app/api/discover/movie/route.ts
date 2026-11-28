import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { isValidCountry } from "@/lib/countries";
import { requireSession } from "@/lib/apiGuard";
import { parsePage } from "@/lib/discoverPaging";

export async function GET(req: NextRequest) {
  const denied = await requireSession();
  if (denied) return denied;

  try {
    const genreId = req.nextUrl.searchParams.get("genreId");
    const country = req.nextUrl.searchParams.get("country");
    const page = parsePage(req.nextUrl.searchParams.get("page"));
    if (page === null) {
      return NextResponse.json({ error: "Invalid page" }, { status: 400 });
    }
    if (country && !isValidCountry(country)) {
      return NextResponse.json({ error: "Invalid country" }, { status: 400 });
    }
    if (!genreId && !country) {
      return NextResponse.json({ error: "genreId or country required" }, { status: 400 });
    }
    const id = genreId ? parseInt(genreId) : undefined;
    if (id !== undefined && isNaN(id)) {
      return NextResponse.json({ error: "Invalid genreId" }, { status: 400 });
    }

    if (country) {
      // Two TMDB pages per request so a country browse fills the grid like the default Discover feed
      // (request page 1 = TMDB pages 1-2, page 2 = 3-4, ...)
      const pages = await Promise.all([page * 2 - 1, page * 2].map((p) => tmdb.discoverMoviesByCountry(country, id, p)));
      const results = pages.flatMap((d) => d.results || []).filter((m) => m.poster_path);
      return NextResponse.json({ results });
    }

    const data = await tmdb.discoverMoviesByGenre(id!, page);
    return NextResponse.json({ results: (data.results || []).filter((m) => m.poster_path) });
  } catch (error) {
    console.error("Discover movie error:", error);
    return NextResponse.json({ error: "Discover failed" }, { status: 500 });
  }
}
