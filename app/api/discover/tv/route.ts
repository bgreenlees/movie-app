import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";
import { isValidCountry } from "@/lib/countries";

export async function GET(req: NextRequest) {
  try {
    const genreId = req.nextUrl.searchParams.get("genreId");
    const country = req.nextUrl.searchParams.get("country");
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
      // Two pages so a country browse fills the grid like the default Discover feed
      const pages = await Promise.all([1, 2].map((p) => tmdb.discoverTVByCountry(country, id, p)));
      const results = pages.flatMap((d) => d.results || []).filter((s) => s.poster_path);
      return NextResponse.json({ results });
    }

    const data = await tmdb.discoverTVByGenreSingle(id!);
    return NextResponse.json({ results: (data.results || []).filter((s) => s.poster_path) });
  } catch (error) {
    console.error("Discover TV error:", error);
    return NextResponse.json({ error: "Discover failed" }, { status: 500 });
  }
}
