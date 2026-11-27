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
import { buildProviderOptions, formatRating, formatRuntime, genreList, heroEyebrow, joinMeta, yearOf } from "@/lib/detailView";
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
      title: `${details.title} — What's Up Next`,
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

  const sessionPromise = auth();
  const [details, providersData, recsData, session, serviceIds] = await Promise.all([
    tmdb.getMovieDetailsWithCredits(movieId).catch(() => null),
    tmdb.getWatchProviders(movieId).catch(() => null),
    tmdb.getMovieRecommendations(movieId).catch(() => null),
    sessionPromise,
    sessionPromise.then((s) => getUserServiceIds(s?.user?.id)),
  ]);
  const isLoggedIn = !!session?.user;

  if (!details) notFound();

  const director = details.crew.find((c) => c.job === "Director");
  const writers = details.crew
    .filter((c) => c.department === "Writing" && ["Screenplay", "Writer", "Story"].includes(c.job))
    .slice(0, 3);
  const providers = buildProviderOptions(providersData?.results?.US, serviceIds);
  const similar = (recsData?.results || []).slice(0, 14).map((rec) => ({
    id: rec.id,
    title: rec.title,
    href: `/movie/${rec.id}`,
    posterPath: rec.poster_path,
    meta: joinMeta([yearOf(rec.release_date), "Movie"]),
  }));

  const credits = [
    director && { label: "Director", value: director.name },
    writers.length > 0 && { label: writers.length === 1 ? "Writer" : "Writers", value: writers.map((w) => w.name).join(", ") },
  ].filter((c): c is { label: string; value: string } => !!c);

  return (
    <div className="min-h-screen bg-bg">
      {isLoggedIn ? <Navbar /> : <PublicHeader isLoggedIn={false} />}
      <main id="main-content">
        <DetailHero
          title={details.title}
          backdropUrl={tmdb.getBackdropUrl(details.backdrop_path)}
          posterUrl={tmdb.getPosterUrl(details.poster_path)}
          eyebrow={heroEyebrow("movie", providers)}
          meta={joinMeta([yearOf(details.release_date), formatRuntime(details.runtime), genreList(details.genres), formatRating(details.vote_average)])}
          tagline={details.tagline}
          overview={details.overview}
          credits={credits}
          actions={
            <>
              <MovieWatchlistAction movieId={movieId} movieTitle={details.title} isLoggedIn={isLoggedIn} />
              <TrailerButton id={movieId} title={details.title} mediaType="movie" className={heroSecondaryButton} />
              <ShareButton url={`/movie/${movieId}`} title={details.title} text={details.overview || undefined} className={heroSecondaryButton} />
            </>
          }
        />
        <div className="mx-auto flex max-w-[1376px] flex-col gap-12 px-4 pb-16 pt-12 sm:px-6 lg:px-8">
          <WhereToWatch providers={providers} />
          <CastShelf cast={details.cast} />
          <MoreLikeThis items={similar} />
        </div>
      </main>
    </div>
  );
}
