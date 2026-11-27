import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiGuard";
import { tmdb } from "@/lib/tmdb";
import { ONBOARDING_MOVIE_IDS } from "@/lib/onboarding";

export async function GET() {
  const denied = await requireSession();
  if (denied) return denied;
  const results = await Promise.allSettled(
    ONBOARDING_MOVIE_IDS.map((id) => tmdb.getMovieDetails(id))
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
