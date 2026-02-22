"use client";

import { useEffect, useState, use } from "react";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import toast from "react-hot-toast";

interface DbMovie {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  overview: string | null;
}

interface TmdbMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
}

interface WatchTogetherData {
  friend: { id: string; name: string | null; email: string };
  bothWantToWatch: DbMovie[];
  friendLovedForMe: DbMovie[];
  iLovedForFriend: DbMovie[];
  freshPicks: TmdbMovie[];
}

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

function MovieSection({
  title,
  subtitle,
  movies,
  watchlistEntries,
  onAdd,
  trailerMovie,
  setTrailerMovie,
}: {
  title: string;
  subtitle: string;
  movies: Array<{ id: number; title: string; posterPath: string | null; releaseDate: string | null }>;
  watchlistEntries: Record<number, WatchlistEntry>;
  onAdd: (movie: { id: number; title: string }) => void;
  trailerMovie: { id: number; title: string } | null;
  setTrailerMovie: (m: { id: number; title: string } | null) => void;
}) {
  if (movies.length === 0) return null;

  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-1" style={{ color: "var(--primary)" }}>
        {title}
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        {subtitle}
      </p>
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
        {movies.map((movie) => {
          const existing = watchlistEntries[movie.id];
          return (
            <MovieCard
              key={movie.id}
              id={movie.id}
              title={movie.title}
              posterPath={movie.posterPath}
              releaseDate={movie.releaseDate || undefined}
              onPlayTrailer={(id) => setTrailerMovie({ id, title: movie.title })}
            >
              <button
                onClick={() => onAdd({ id: movie.id, title: movie.title })}
                className="w-full px-3 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {existing ? "Update" : "Add"}
              </button>
            </MovieCard>
          );
        })}
      </div>
    </section>
  );
}

export default function WatchTogetherPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [data, setData] = useState<WatchTogetherData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [selectedMovie, setSelectedMovie] = useState<{ id: number; title: string } | null>(null);
  const [trailerMovie, setTrailerMovie] = useState<{ id: number; title: string } | null>(null);

  const fetchWatchlist = async () => {
    try {
      const [wantRes, watchedRes] = await Promise.all([
        fetch("/api/watchlist?status=WANT_TO_WATCH"),
        fetch("/api/watchlist?status=WATCHED"),
      ]);
      if (wantRes.ok && watchedRes.ok) {
        const [wantData, watchedData] = await Promise.all([wantRes.json(), watchedRes.json()]);
        const entries: Record<number, WatchlistEntry> = {};
        [...(wantData.entries || []), ...(watchedData.entries || [])].forEach((entry: WatchlistEntry & { movieId: number }) => {
          entries[entry.movieId] = entry;
        });
        setWatchlistEntries(entries);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/watch-together/${userId}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Failed to load");
        }
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
        toast.error("Failed to load Watch Together data");
      } finally {
        setIsLoading(false);
      }
    };

    load();
    fetchWatchlist();
  }, [userId]);

  // Normalise freshPicks (TMDB snake_case) to DbMovie shape
  const freshPicksNormalized: DbMovie[] =
    data?.freshPicks.map((m) => ({
      id: m.id,
      title: m.title,
      posterPath: m.poster_path,
      releaseDate: m.release_date,
      overview: m.overview,
    })) ?? [];

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>{error || "Something went wrong."}</p>
      </div>
    );
  }

  const friendName = data.friend.name || data.friend.email;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        Watch Together
      </h1>
      <p className="text-base mb-10" style={{ color: "var(--text-muted)" }}>
        with <span style={{ color: "var(--foreground)" }}>{friendName}</span>
      </p>

      <MovieSection
        title="Both Want to Watch"
        subtitle="Movies you both have on your watchlist"
        movies={data.bothWantToWatch}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        trailerMovie={trailerMovie}
        setTrailerMovie={setTrailerMovie}
      />

      <MovieSection
        title={`${friendName} Loved — You Haven't Seen`}
        subtitle={`${friendName}'s top-rated movies that aren't on your list yet`}
        movies={data.friendLovedForMe}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        trailerMovie={trailerMovie}
        setTrailerMovie={setTrailerMovie}
      />

      <MovieSection
        title={`You Loved — ${friendName} Hasn't Seen`}
        subtitle={`Your top-rated movies that ${friendName} hasn't added yet`}
        movies={data.iLovedForFriend}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        trailerMovie={trailerMovie}
        setTrailerMovie={setTrailerMovie}
      />

      <MovieSection
        title="Fresh Picks for Both of You"
        subtitle="Movies recommended based on films you both loved"
        movies={freshPicksNormalized}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        trailerMovie={trailerMovie}
        setTrailerMovie={setTrailerMovie}
      />

      {data.bothWantToWatch.length === 0 &&
        data.friendLovedForMe.length === 0 &&
        data.iLovedForFriend.length === 0 &&
        freshPicksNormalized.length === 0 && (
          <div className="text-center py-16">
            <p style={{ color: "var(--text-muted)" }}>
              Not enough data yet. Rate some movies and ask {friendName} to do the same!
            </p>
          </div>
        )}

      <TrailerModal
        movieId={trailerMovie?.id ?? null}
        movieTitle={trailerMovie?.title ?? ""}
        onClose={() => setTrailerMovie(null)}
      />

      {selectedMovie && (
        <AddMovieModal
          isOpen={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          movieId={selectedMovie.id}
          movieTitle={selectedMovie.title}
          existingEntry={watchlistEntries[selectedMovie.id]}
          onSuccess={() => {
            setSelectedMovie(null);
            fetchWatchlist();
          }}
        />
      )}
    </div>
  );
}
