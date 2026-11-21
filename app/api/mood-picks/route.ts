import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { canonicalProviderIds } from "@/lib/providers";
import {
  candidateKey,
  matchesDiscoverParams,
  mediaTypesFor,
  moodToDiscoverParams,
  parseMoodSelection,
  type MediaType,
  type MoodCandidate,
} from "@/lib/moodPicker";

// How many discover pages (20 results each) to pull per media type for the pool.
const PAGES = [1, 2, 3];
// Most-recently-added watchlist titles to check against the moods, per media type.
// Each is one (24h-cached) TMDB details call, so this is capped.
const WATCHLIST_CHECK = 20;

// Returns a filtered candidate pool; the client picks 3–5 from it with
// pickRecommendations, so Shuffle is instant and doesn't re-hit TMDB.
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const selection = parseMoodSelection(req.nextUrl.searchParams);

    const [user, movieEntries, tvEntries] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { streamingServices: true } }),
      prisma.watchlistEntry.findMany({
        where: { userId },
        orderBy: { addedAt: "desc" },
        select: { id: true, movieId: true, status: true, platform: true, watchType: true, rating: true, review: true },
      }),
      prisma.tVWatchlistEntry.findMany({
        where: { userId },
        orderBy: { addedAt: "desc" },
        select: {
          id: true, tvShowId: true, status: true, platform: true, rating: true, review: true,
          currentSeason: true, currentEpisode: true,
        },
      }),
    ]);
    const providerIds = canonicalProviderIds(user?.streamingServices ?? []);

    // Want-to-watch entries are returned whole so the page can open the Add/Update
    // modals with them; everything else (watched, not interested, and TV already in
    // progress on "My TV") is excluded from picks.
    const watchlist: Record<string, (typeof movieEntries)[number] | (typeof tvEntries)[number]> = {};
    const wantIds: Record<MediaType, number[]> = { movie: [], tv: [] };
    const exclude: string[] = [];
    for (const e of movieEntries) {
      const key = candidateKey({ id: e.movieId, mediaType: "movie" });
      if (e.status === "WANT_TO_WATCH") {
        watchlist[key] = e;
        wantIds.movie.push(e.movieId);
      } else exclude.push(key);
    }
    for (const e of tvEntries) {
      const key = candidateKey({ id: e.tvShowId, mediaType: "tv" });
      if (e.status === "WANT_TO_WATCH") {
        watchlist[key] = e;
        wantIds.tv.push(e.tvShowId);
      } else exclude.push(key);
    }

    const ctx = { today: new Date(), providerIds };
    const fetches: Promise<MoodCandidate[]>[] = mediaTypesFor(selection.media).flatMap((media) => {
      const params = moodToDiscoverParams(selection, media, ctx);

      const discoverPages = PAGES.map((page) =>
        media === "movie"
          ? tmdb.discover("movie", params, page).then((d) =>
              (d.results || []).map<MoodCandidate>((m) => ({
                id: m.id,
                mediaType: "movie",
                title: m.title,
                posterPath: m.poster_path,
                date: m.release_date,
                overview: m.overview,
                popularity: m.popularity,
                voteAverage: m.vote_average,
              }))
            )
          : tmdb.discover("tv", params, page).then((d) =>
              (d.results || []).map<MoodCandidate>((s) => ({
                id: s.id,
                mediaType: "tv",
                title: s.name,
                posterPath: s.poster_path,
                date: s.first_air_date,
                overview: s.overview,
                popularity: s.popularity,
                voteAverage: s.vote_average,
              }))
            )
      );

      // Discover can't filter by ID and rarely returns watchlist titles, so check
      // them directly against the same params — that's what makes "watchlist first" work.
      const watchlistMatches = wantIds[media].slice(0, WATCHLIST_CHECK).map((id) =>
        tmdb.getTitleMoodFacts(media, id).then((t) =>
          matchesDiscoverParams(params, t)
            ? [{
                id: t.id,
                mediaType: media,
                title: t.title,
                posterPath: t.posterPath,
                date: t.date,
                overview: t.overview,
                popularity: t.popularity,
                voteAverage: t.voteAverage,
              }]
            : []
        )
      );

      return [...discoverPages, ...watchlistMatches];
    });

    const settled = await Promise.allSettled(fetches);
    if (settled.length > 0 && settled.every((r) => r.status === "rejected")) {
      throw new Error("All TMDB calls failed");
    }
    const pool = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    return NextResponse.json({
      pool,
      watchlist,
      exclude,
      hasServices: providerIds.length > 0,
    });
  } catch (error) {
    console.error("Mood picks error:", error);
    return NextResponse.json({ error: "Failed to load picks" }, { status: 500 });
  }
}
