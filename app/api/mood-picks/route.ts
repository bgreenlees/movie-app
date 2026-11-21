import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { tmdb } from "@/lib/tmdb";
import { canonicalProviderIds } from "@/lib/providers";
import { createLimiter } from "@/lib/concurrency";
import {
  blendPools,
  candidateKey,
  filterByRealRuntime,
  matchesDiscoverParams,
  mediaTypesFor,
  moodToDiscoverParams,
  parseMoodSelection,
  type MediaType,
  type MoodCandidate,
} from "@/lib/moodPicker";

// Discover pages (20 results each) fetched per media type, and the size of the
// blended pool the picker draws from.
const PAGES = [1, 2, 3];
const POOL_SIZE = 60;
// Most-recently-added watchlist titles to check against the moods, per media type.
// Each is one (24h-cached) TMDB details call, so this is capped.
const WATCHLIST_CHECK = 20;
// TMDB detail lookups (watchlist checks + runtime checks) in flight at once, per request
const DETAIL_CONCURRENCY = 6;

// Log a failed TMDB call without leaking the API key, in case an error message
// ever includes the request URL.
function warnFailed(what: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Mood picks: ${what} failed: ${message.replace(/api_key=[^&\s]+/g, "api_key=***")}`);
}

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
    const medias = mediaTypesFor(selection.media);
    const paramsFor = Object.fromEntries(
      medias.map((m) => [m, moodToDiscoverParams(selection, m, ctx)])
    ) as Record<MediaType, Record<string, string>>;
    const limit = createLimiter(DETAIL_CONCURRENCY);

    // Per type: up to 3 discover pages, plus TMDB's count of all matches, which
    // blendPools uses to size each type's share of the pool.
    const discoverGroups = medias.map(async (media) => {
      const params = paramsFor[media];
      const pages = await Promise.allSettled(
        PAGES.map((page) =>
          media === "movie"
            ? tmdb.discover("movie", params, page).then((d) => ({
                total: d.total_results,
                candidates: (d.results || []).map<MoodCandidate>((m) => ({
                  id: m.id,
                  mediaType: "movie",
                  title: m.title,
                  posterPath: m.poster_path,
                  date: m.release_date,
                  overview: m.overview,
                  popularity: m.popularity,
                  voteAverage: m.vote_average,
                  voteCount: m.vote_count,
                  genreIds: m.genre_ids,
                })),
              }))
            : tmdb.discover("tv", params, page).then((d) => ({
                total: d.total_results,
                candidates: (d.results || []).map<MoodCandidate>((s) => ({
                  id: s.id,
                  mediaType: "tv",
                  title: s.name,
                  posterPath: s.poster_path,
                  date: s.first_air_date,
                  overview: s.overview,
                  popularity: s.popularity,
                  voteAverage: s.vote_average,
                  voteCount: s.vote_count,
                  genreIds: s.genre_ids,
                })),
              }))
        )
      );
      pages.forEach((r, i) => {
        if (r.status === "rejected") warnFailed(`discover ${media} page ${PAGES[i]}`, r.reason);
      });
      const ok = pages.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      if (ok.length === 0) throw new Error(`TMDB discover failed for ${media}`);
      return { total: ok[0].total, candidates: ok.flatMap((p) => p.candidates) };
    });

    // Discover can't filter by ID and rarely returns watchlist titles, so check
    // them directly against the same params — that's what makes "watchlist first"
    // work. They're added on top of the blended pool: the user chose them.
    const watchlistChecks = medias.flatMap((media) => {
      const params = paramsFor[media];
      return wantIds[media].slice(0, WATCHLIST_CHECK).map((id) =>
        limit(() => tmdb.getTitleMoodFacts(media, id)).then((t): MoodCandidate[] =>
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
                voteCount: t.voteCount,
                genreIds: t.genreIds,
              }]
            : []
        )
      );
    });

    const [groups, checks] = await Promise.all([
      Promise.allSettled(discoverGroups),
      Promise.allSettled(watchlistChecks),
    ]);
    const okGroups = groups.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    if (okGroups.length === 0) throw new Error("All TMDB discover calls failed");
    const failedChecks = checks.filter((r) => r.status === "rejected");
    if (failedChecks.length > 0) {
      warnFailed(`${failedChecks.length} of ${checks.length} watchlist checks`, (failedChecks[0] as PromiseRejectedResult).reason);
    }

    // Discover's runtime filter is leaky for movies, so when time is limited each
    // movie's real runtime is checked (24h-cached details call) before it can be
    // picked. TV episode lengths from discover have held up, so they're trusted.
    const blended = blendPools(okGroups, POOL_SIZE);
    const verified = paramsFor.movie
      ? await filterByRealRuntime(
          blended.filter((c) => c.mediaType === "movie"),
          paramsFor.movie,
          (c) =>
            limit(() => tmdb.getTitleMoodFacts("movie", c.id)).then(
              (t) => t.runtime,
              (error) => {
                warnFailed(`runtime check for movie ${c.id}`, error);
                throw error;
              }
            )
        )
      : [];
    const verifiedKeys = new Set(verified.map(candidateKey));
    const pool = [
      ...checks.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      ...blended.filter((c) => c.mediaType !== "movie" || verifiedKeys.has(candidateKey(c))),
    ];

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
