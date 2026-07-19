import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

export async function GET(req: NextRequest) {
  try {
    const query = req.nextUrl.searchParams.get("q");
    if (!query || query.trim().length < 2) {
      return NextResponse.json({ movies: [], tvShows: [], people: [], genres: [] });
    }

    const [multi, movieGenres, tvGenres] = await Promise.all([
      tmdb.searchMulti(query),
      tmdb.getMovieGenres(),
      tmdb.getTVGenres(),
    ]);

    const movies: any[] = [];
    const tvShows: any[] = [];
    const people: any[] = [];

    for (const r of multi.results || []) {
      if ((r as any).media_type === "movie" && (r as any).poster_path) movies.push(r);
      else if ((r as any).media_type === "tv" && (r as any).poster_path) tvShows.push(r);
      else if ((r as any).media_type === "person" && (r as any).profile_path) people.push(r);
    }

    movies.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    tvShows.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    people.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));

    const q = query.trim().toLowerCase();
    const seenGenreNames = new Set<string>();
    const genres: Array<{ id: number; name: string; media: "movie" | "tv" }> = [];
    for (const g of movieGenres) {
      if (g.name.toLowerCase().includes(q) && !seenGenreNames.has(g.name)) {
        genres.push({ id: g.id, name: g.name, media: "movie" });
        seenGenreNames.add(g.name);
      }
    }
    for (const g of tvGenres) {
      if (g.name.toLowerCase().includes(q) && !seenGenreNames.has(g.name)) {
        genres.push({ id: g.id, name: g.name, media: "tv" });
        seenGenreNames.add(g.name);
      }
    }

    return NextResponse.json({
      movies: movies.slice(0, 5),
      tvShows: tvShows.slice(0, 5),
      people: people.slice(0, 3),
      genres: genres.slice(0, 3),
    });
  } catch (error) {
    console.error("Multi search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
