import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { tmdb } from "@/lib/tmdb";
import { auth } from "@/lib/auth";
import ShareButton from "@/components/ui/ShareButton";
import PublicHeader from "@/components/layout/PublicHeader";
import MovieWatchlistAction from "@/components/movies/MovieWatchlistAction";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) return {};

  try {
    const details = await tmdb.getMovieDetailsWithCredits(movieId);
    const posterUrl = tmdb.getPosterUrl(details.poster_path, "original");
    return {
      title: `${details.title} — Movie Watchlist`,
      description: details.overview || undefined,
      openGraph: {
        title: details.title,
        description: details.overview || undefined,
        images: posterUrl ? [posterUrl] : undefined,
      },
      twitter: {
        card: "summary_large_image",
        title: details.title,
        description: details.overview || undefined,
        images: posterUrl ? [posterUrl] : undefined,
      },
    };
  } catch {
    return {};
  }
}

export default async function MoviePage({ params }: Props) {
  const { id } = await params;
  const movieId = parseInt(id);
  if (isNaN(movieId)) notFound();

  const [details, providersData, recsData, session] = await Promise.all([
    tmdb.getMovieDetailsWithCredits(movieId).catch(() => null),
    tmdb.getWatchProviders(movieId).catch(() => null),
    tmdb.getMovieRecommendations(movieId).catch(() => null),
    auth(),
  ]);

  if (!details) notFound();

  const posterUrl = tmdb.getPosterUrl(details.poster_path);
  const director = details.crew.find((c) => c.job === "Director");
  const writers = details.crew
    .filter((c) => c.department === "Writing" && ["Screenplay", "Writer", "Story"].includes(c.job))
    .slice(0, 3);
  const us = providersData?.results?.US;
  const flatrate = us?.flatrate || [];
  const rent = us?.rent || [];
  const recs = (recsData?.results || []).slice(0, 12);

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
              <Image
                src={posterUrl}
                alt={details.title}
                width={200}
                height={300}
                className="object-cover w-full h-full"
                priority
              />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: "var(--primary)" }}>
              {details.title}
            </h1>
            {details.release_date && (
              <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
                {new Date(details.release_date).getFullYear()}
              </p>
            )}

            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <MovieWatchlistAction movieId={movieId} movieTitle={details.title} isLoggedIn={!!session?.user} />
              <ShareButton url={`/movie/${movieId}`} title={details.title} text={details.overview || undefined} />
            </div>

            {details.tagline && (
              <p className="text-sm italic mb-3 leading-snug" style={{ color: "var(--text-muted)" }}>
                &ldquo;{details.tagline}&rdquo;
              </p>
            )}
            {details.overview && (
              <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--foreground)" }}>
                {details.overview}
              </p>
            )}

            <div className="space-y-1 text-sm">
              {director && (
                <div className="flex gap-2">
                  <span className="font-semibold shrink-0 w-16" style={{ color: "var(--text-muted)" }}>Director</span>
                  <span style={{ color: "var(--foreground)" }}>{director.name}</span>
                </div>
              )}
              {writers.length > 0 && (
                <div className="flex gap-2">
                  <span className="font-semibold shrink-0 w-16" style={{ color: "var(--text-muted)" }}>
                    {writers.length === 1 ? "Writer" : "Writers"}
                  </span>
                  <span style={{ color: "var(--foreground)" }}>{writers.map((w) => w.name).join(", ")}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {(flatrate.length > 0 || rent.length > 0) && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Where to Watch
            </h2>
            {flatrate.length > 0 && (
              <div className="mb-3">
                <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Stream</p>
                <div className="flex flex-wrap gap-2">
                  {flatrate.map((p) => (
                    <div
                      key={p.provider_id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                      style={{ border: "1px solid var(--border)" }}
                      title={p.provider_name}
                    >
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
                    <div
                      key={p.provider_id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                      style={{ border: "1px solid var(--border)" }}
                      title={p.provider_name}
                    >
                      <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                      <span className="text-xs" style={{ color: "var(--foreground)" }}>{p.provider_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {details.cast.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Top Cast
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {details.cast.map((member) => (
                <div key={member.id} className="text-center">
                  <div
                    className="rounded-full overflow-hidden mx-auto mb-1.5"
                    style={{ width: 56, height: 56, backgroundColor: "var(--border)" }}
                  >
                    {member.profile_path ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                        alt={member.name}
                        width={56}
                        height={56}
                        className="object-cover w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-muted)", fontSize: 22 }}>◉</div>
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight" style={{ color: "var(--foreground)" }}>{member.name}</p>
                  <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>{member.character}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {recs.length > 0 && (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              More like this
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {recs.map((rec) => (
                <Link key={rec.id} href={`/movie/${rec.id}`} className="shrink-0 group" style={{ width: 110 }} title={rec.title}>
                  <div
                    className="relative rounded-md overflow-hidden mb-1.5"
                    style={{ width: 110, aspectRatio: "2/3", backgroundColor: "var(--border)" }}
                  >
                    {rec.poster_path && (
                      <Image
                        src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                        alt={rec.title}
                        width={110}
                        height={165}
                        className="object-cover w-full h-full group-hover:opacity-90 transition-opacity"
                      />
                    )}
                  </div>
                  <p className="text-xs font-medium leading-tight line-clamp-2" style={{ color: "var(--foreground)" }}>{rec.title}</p>
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
