import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tmdb } from "@/lib/tmdb";
import { auth } from "@/lib/auth";
import ShareButton from "@/components/ui/ShareButton";
import TrailerButton from "@/components/ui/TrailerButton";
import PublicHeader from "@/components/layout/PublicHeader";
import Navbar from "@/components/layout/Navbar";
import DetailHero from "@/components/detail/DetailHero";
import { CastShelf, MoreLikeThis, WhereToWatch } from "@/components/detail/DetailShelves";
import { heroSecondaryButton } from "@/components/detail/buttonStyles";
import { getUserServiceIds } from "@/lib/userServices";
import { buildProviderOptions, formatRating, formatRuntime, genreList, heroEyebrow, joinMeta, tvYearSpan, yearOf } from "@/lib/detailView";
import TVWatchlistAction from "@/components/tv/TVWatchlistAction";

interface Props {
  params: Promise<{ id: string }>;
}

function formatAirDate(dateStr: string | null) {
  if (!dateStr) return "TBA";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const tvId = parseInt(id);
  if (isNaN(tvId)) return {};

  try {
    const details = await tmdb.getTVShowDetails(tvId);
    const posterUrl = tmdb.getPosterUrl(details.poster_path, "original");
    return {
      title: `${details.name} — What's Up Next`,
      description: details.overview || undefined,
      openGraph: {
        title: details.name,
        description: details.overview || undefined,
        images: posterUrl ? [posterUrl] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: details.name,
        description: details.overview || undefined,
        images: posterUrl ? [posterUrl] : undefined,
      },
    };
  } catch {
    return {};
  }
}

export default async function TVShowPage({ params }: Props) {
  const { id } = await params;
  const tvId = parseInt(id);
  if (isNaN(tvId)) notFound();

  const sessionPromise = auth();
  const [details, credits, providersData, recsData, session, serviceIds] = await Promise.all([
    tmdb.getTVShowDetails(tvId).catch(() => null),
    tmdb.getTVCredits(tvId).catch(() => ({ cast: [], crew: [] })),
    tmdb.getTVWatchProviders(tvId).catch(() => null),
    tmdb.getTVRecommendations(tvId).catch(() => null),
    sessionPromise,
    sessionPromise.then((s) => getUserServiceIds(s?.user?.id)),
  ]);

  if (!details) notFound();

  const isLoggedIn = !!session?.user;
  const cast = (credits.cast || []).slice(0, 8);
  const providers = buildProviderOptions(providersData?.results?.US, serviceIds);
  const similar = (recsData?.results || []).slice(0, 14).map((rec) => ({
    id: rec.id,
    title: rec.name,
    href: `/tv/${rec.id}`,
    posterPath: rec.poster_path,
    meta: joinMeta([yearOf(rec.first_air_date), "TV"]),
  }));
  const mainSeasons = details.seasons.filter((s) => s.season_number > 0);
  const nextEp = details.next_episode_to_air;
  const daysAway = nextEp ? daysUntil(nextEp.air_date) : null;
  const ended = details.status === "Ended" || details.status === "Canceled";
  const episodeRuntime = details.episode_run_time?.[0] ?? details.last_episode_to_air?.runtime ?? null;
  const seasonCount = details.number_of_seasons
    ? `${details.number_of_seasons} season${details.number_of_seasons === 1 ? "" : "s"}`
    : null;

  const heroCredits = [
    details.status && { label: "Status", value: details.status },
    details.number_of_episodes > 0 && { label: "Episodes", value: String(details.number_of_episodes) },
    details.networks.length > 0 && { label: "Network", value: details.networks.map((n) => n.name).join(", ") },
  ].filter((c): c is { label: string; value: string } => !!c);

  return (
    <div className="min-h-screen bg-bg">
      {isLoggedIn ? <Navbar /> : <PublicHeader isLoggedIn={false} />}
      <main id="main-content">
        <DetailHero
          title={details.name}
          backdropUrl={tmdb.getBackdropUrl(details.backdrop_path)}
          posterUrl={tmdb.getPosterUrl(details.poster_path)}
          eyebrow={heroEyebrow("tv", providers)}
          meta={joinMeta([
            tvYearSpan(details.first_air_date, details.last_air_date, ended),
            seasonCount,
            formatRuntime(episodeRuntime),
            genreList(details.genres),
            formatRating(details.vote_average),
          ])}
          tagline={details.tagline}
          overview={details.overview}
          credits={heroCredits}
          actions={
            <>
              <TVWatchlistAction tvShowId={tvId} tvShowName={details.name} isLoggedIn={isLoggedIn} />
              <TrailerButton id={tvId} title={details.name} mediaType="tv" className={heroSecondaryButton} />
              <ShareButton url={`/tv/${tvId}`} title={details.name} text={details.overview || undefined} className={heroSecondaryButton} />
            </>
          }
        />
        <div className="mx-auto flex max-w-[1376px] flex-col gap-12 px-4 pb-16 pt-12 sm:px-6 lg:px-8">
          {nextEp && (
            <section aria-label="Next episode" className="max-w-xl rounded-card border border-accent bg-surface px-4 py-3">
              <p className="text-label uppercase text-accent-text">Next episode</p>
              <p className="mt-1 text-title text-text">
                S{String(nextEp.season_number).padStart(2, "0")}E{String(nextEp.episode_number).padStart(2, "0")} — {nextEp.name}
              </p>
              <p className="text-meta text-muted">
                {formatAirDate(nextEp.air_date)}
                {daysAway !== null && daysAway > 0 && ` · in ${daysAway} day${daysAway === 1 ? "" : "s"}`}
                {daysAway !== null && daysAway === 0 && " · Today!"}
                {daysAway !== null && daysAway < 0 && " · Aired"}
              </p>
            </section>
          )}
          <WhereToWatch providers={providers} />
          <CastShelf cast={cast} />
          {mainSeasons.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-h2 text-text">Seasons</h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {mainSeasons.map((season) => (
                  <li key={season.season_number} className="rounded-card border border-border bg-surface px-4 py-3">
                    <span className="block text-title text-text">{season.name}</span>
                    <span className="text-meta text-muted">
                      {joinMeta([`${season.episode_count} episode${season.episode_count === 1 ? "" : "s"}`, yearOf(season.air_date)])}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <MoreLikeThis items={similar} />
        </div>
      </main>
    </div>
  );
}
