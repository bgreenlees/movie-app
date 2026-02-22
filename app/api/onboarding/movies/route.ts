import { NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

// All curated onboarding movie IDs
const MOVIE_IDS = [
  37799, 244786, 205596, 60308, 453,    // Mind & Intellect
  155, 27205, 76341, 98, 245891,         // Action & Epic
  603, 157336, 329865, 264644, 335984,   // Sci-Fi
  278, 13, 489, 8358, 497,               // Heartwarming Classics
  120467, 546554, 8363, 445571, 55721,   // Comedy & Fun
  862, 129, 354912, 420818, 12,          // Animation
  419430, 496243, 274, 447332, 493922,   // Thriller & Horror
  313369, 597, 11036, 122906, 4348,      // Romance & Drama
];

export async function GET() {
  const results = await Promise.allSettled(
    MOVIE_IDS.map((id) => tmdb.getMovieDetails(id))
  );

  const movies: Record<number, { posterPath: string | null; title: string }> = {};
  for (const r of results) {
    if (r.status === "fulfilled") {
      movies[r.value.id] = {
        posterPath: r.value.poster_path,
        title: r.value.title,
      };
    }
  }

  return NextResponse.json({ movies });
}
