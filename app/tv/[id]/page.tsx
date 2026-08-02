import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tmdb } from "@/lib/tmdb";
import { auth } from "@/lib/auth";
import ShareButton from "@/components/ui/ShareButton";
import PublicHeader from "@/components/layout/PublicHeader";
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

  const [details, credits, providersData, recsData, session] = await Promise.all([
    tmdb.getTVShowDetails(tvId).catch(() => null),
    tmdb.getTVCredits(tvId).catch(() => ({ cast: [], crew: [] })),
    tmdb.getTVWatchProviders(tvId).catch(() => null),
    tmdb.getTVRecommendations(tvId).catch(() => null),
    auth(),
  ]);

  if (!details) notFound();

  const posterUrl = tmdb.getPosterUrl(details.poster_path);
  const cast = (credits.cast || []).slice(0, 8);
  const us = providersData?.results?.US;
  const flatrate = us?.flatrate || [];
  const rent = us?.rent || [];
  const recs = (recsData?.results || []).slice(0, 12);
  const mainSeasons = details.seasons.filter((s) => s.season_number > 0);
  const nextEp = details.next_episode_to_air;
  const daysAway = nextEp ? daysUntil(nextEp.air_date) : null;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--secondary-bg)" }}>
      <PublicHeader isLoggedIn={!!session?.user} />
      <main className="max-w-3xl mx-auto p-4 sm:p-6">
        <div className="flex gap-5 flex-col sm:flex-row">
          {posterUrl && (
            <div
              className="shrink-0 rounded-lg overflow-hidden mx-auto sm:mx-0"
              style={{ width: 200, aspectRatio: "2/3", backgroundColor: "var(--border)" }}
            >
              <Image src={posterUrl} alt={details.name} width={200} height={300} className="object-cover w-full h-full" priority />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: "var(--primary)" }}>
              {details.name}
            </h1>
            {details.first_air_date && (
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                {new Date(details.first_air_date).getFullYear()}
              </p>
            )}

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <TVWatchlistAction tvShowId={tvId} tvShowName={details.name} isLoggedIn={!!session?.user} />
              <ShareButton url={`/tv/${tvId}`} title={details.name} text={details.overview || undefined} />
            </div>

            {details.tagline && (
              <p className="text-sm italic mb-2 leading-snug" style={{ color: "var(--text-muted)" }}>
                &ldquo;{details.tagline}&rdquo;
              </p>
            )}
            {details.overview && (
              <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--foreground)" }}>
                {details.overview}
              </p>
            )}

            <div className="space-y-1 text-sm">
              <div className="flex gap-2">
                <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Status</span>
                <span style={{ color: "var(--foreground)" }}>{details.status}</span>
              </div>
              <div className="flex gap-2">
                <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Seasons</span>
                <span style={{ color: "var(--foreground)" }}>{details.number_of_seasons} seasons · {details.number_of_episodes} episodes</span>
              </div>
              {details.networks.length > 0 && (
                <div className="flex gap-2">
                  <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Network</span>
                  <span style={{ color: "var(--foreground)" }}>{details.networks.map((n) => n.name).join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {nextEp && (
          <div
            className="mt-4 px-4 py-3 rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))", border: "1px solid var(--accent)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>Next Episode</p>
            <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              S{String(nextEp.season_number).padStart(2, "0")}E{String(nextEp.episode_number).padStart(2, "0")} — {nextEp.name}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {formatAirDate(nextEp.air_date)}
              {daysAway !== null && daysAway > 0 && ` · in ${daysAway} day${daysAway === 1 ? "" : "s"}`}
              {daysAway !== null && daysAway === 0 && " · Today!"}
              {daysAway !== null && daysAway < 0 && " · Aired"}
            </p>
          </div>
        )}

        {(flatrate.length > 0 || rent.length > 0) && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Where to Watch</h2>
            {flatrate.length > 0 && (
              <div className="mb-3">
                <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Stream</p>
                <div className="flex flex-wrap gap-2">
                  {flatrate.map((p) => (
                    <div key={p.provider_id} className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ border: "1px solid var(--border)" }} title={p.provider_name}>
                      <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                      <span className="text-xs" style={{ color: "var(--foreground)" }}>{p.provider_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {rent.length > 0 && (
              <div>
                <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Rent / Buy</p>
                <div className="flex flex-wrap gap-2">
                  {rent.map((p) => (
                    <div key={p.provider_id} className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ border: "1px solid var(--border)" }} title={p.provider_name}>
                      <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                      <span className="text-xs" style={{ color: "var(--foreground)" }}>{p.provider_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mainSeasons.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Seasons</h2>
            <div className="space-y-2">
              {mainSeasons.map((season) => (
                <div key={season.season_number} className="px-4 py-3 rounded-lg" style={{ border: "1px solid var(--border)" }}>
                  <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{season.name}</span>
                  <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                    {season.episode_count} episodes
                    {season.air_date && ` · ${new Date(season.air_date).getFullYear()}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {cast.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>Top Cast</h2>
            <div className="grid grid-cols-4 gap-3">
              {cast.map((member) => (
                <Link
                  key={member.id}
                  href={`/search?personId=${member.id}&name=${encodeURIComponent(member.name)}`}
                  className="text-center hover:opacity-80 transition-opacity"
                >
                  <div className="rounded-full overflow-hidden mx-auto mb-1.5" style={{ width: 56, height: 56, backgroundColor: "var(--border)" }}>
                    {member.profile_path ? (
                      <Image src={`https://image.tmdb.org/t/p/w185${member.profile_path}`} alt={member.name} width={56} height={56} className="object-cover w-full h-full" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 22 }}>◉</div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight" style={{ color: "var(--foreground)" }}>{member.name}</p>
                  <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>{member.character}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {recs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>More like this</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recs.map((rec) => (
                <Link key={rec.id} href={`/tv/${rec.id}`} className="shrink-0 group" style={{ width: 110 }} title={rec.name}>
                  <div className="relative rounded-md overflow-hidden mb-1.5" style={{ width: 110, aspectRatio: "2/3", backgroundColor: "var(--border)" }}>
                    {rec.poster_path && (
                      <Image src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`} alt={rec.name} width={110} height={165} className="object-cover w-full h-full group-hover:opacity-90 transition-opacity" />
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: "var(--foreground)" }}>{rec.name}</p>
                  {typeof rec.vote_average === "number" && rec.vote_average > 0 && (
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>★ {rec.vote_average.toFixed(1)}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
