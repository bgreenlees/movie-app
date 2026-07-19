import { NextRequest, NextResponse } from "next/server";
import { tmdb } from "@/lib/tmdb";

const DIRECTOR_JOBS = new Set(["Director"]);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const personId = parseInt(id);
    if (isNaN(personId)) {
      return NextResponse.json({ error: "Invalid person ID" }, { status: 400 });
    }

    const [person, movieCredits, tvCredits] = await Promise.all([
      tmdb.getPersonDetails(personId),
      tmdb.getPersonMovieCredits(personId),
      tmdb.getPersonTVCredits(personId),
    ]);

    const sortByPopularity = (a: any, b: any) => (b.popularity || 0) - (a.popularity || 0);
    const dedupeById = <T extends { id: number }>(arr: T[]): T[] => {
      const seen = new Set<number>();
      return arr.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
    };

    const movieCast = dedupeById(
      (movieCredits.cast || []).filter((m) => m.poster_path).sort(sortByPopularity)
    );
    const movieCrewDirected = dedupeById(
      (movieCredits.crew || [])
        .filter((m) => DIRECTOR_JOBS.has(m.job) && m.poster_path)
        .sort(sortByPopularity)
    );
    const tvCast = dedupeById(
      (tvCredits.cast || []).filter((s) => s.poster_path).sort(sortByPopularity)
    );
    const tvCrewDirected = dedupeById(
      (tvCredits.crew || [])
        .filter((s) => DIRECTOR_JOBS.has(s.job) && s.poster_path)
        .sort(sortByPopularity)
    );

    return NextResponse.json({
      id: person.id,
      name: person.name,
      profilePath: person.profile_path,
      knownFor: person.known_for_department,
      movieCast,
      movieCrewDirected,
      tvCast,
      tvCrewDirected,
    });
  } catch (error) {
    console.error("Person fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch person" }, { status: 500 });
  }
}
