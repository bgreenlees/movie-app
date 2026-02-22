"use client";

import { useEffect, useState } from "react";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import toast from "react-hot-toast";
import type { TMDBMovie } from "@/lib/tmdb";

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

interface NewsData {
  newOnStreaming: TMDBMovie[];
  trending: TMDBMovie[];
  comingSoon: TMDBMovie[];
  nowPlaying: TMDBMovie[];
  personalizedStreaming: boolean;
}

function ScrollRow({
  title,
  movies,
  watchlistEntries,
  onAdd,
  onTrailer,
}: {
  title: string;
  movies: TMDBMovie[];
  watchlistEntries: Record<number, WatchlistEntry>;
  onAdd: (movie: { id: number; title: string }) => void;
  onTrailer: (movie: { id: number; title: string }) => void;
}) {
  if (movies.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="text-lg font-bold mb-4" style={{ color: "var(--primary)" }}>
        {title}
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
      >
        {movies.map((movie) => {
          const existing = watchlistEntries[movie.id];
          return (
            <div key={movie.id} style={{ width: "160px", flexShrink: 0 }}>
              <MovieCard
                id={movie.id}
                title={movie.title}
                posterPath={movie.poster_path}
                releaseDate={movie.release_date}
                onPlayTrailer={() => onTrailer({ id: movie.id, title: movie.title })}
              >
                <button
                  onClick={() => onAdd({ id: movie.id, title: movie.title })}
                  className="w-full px-2 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {existing ? "Update" : "Add"}
                </button>
              </MovieCard>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function NewsPage() {
  const [data, setData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
        [...(wantData.entries || []), ...(watchedData.entries || [])].forEach(
          (entry: WatchlistEntry & { movieId: number }) => {
            entries[entry.movieId] = entry;
          }
        );
        setWatchlistEntries(entries);
      }
    } catch {
      // silently fail
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/api/movies/news");
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        toast.error("Failed to load news");
      } finally {
        setIsLoading(false);
      }
    };

    load();
    fetchWatchlist();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        New Releases
      </h1>
      {data?.personalizedStreaming && (
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          Showing new releases from your streaming services
        </p>
      )}
      {!data?.personalizedStreaming && (
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          Save your streaming services in{" "}
          <a href="/profile" style={{ color: "var(--accent)" }}>
            Profile
          </a>{" "}
          to personalise this page
        </p>
      )}

      <ScrollRow
        title="New on Streaming"
        movies={data?.newOnStreaming ?? []}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        onTrailer={setTrailerMovie}
      />

      <ScrollRow
        title="Trending This Week"
        movies={data?.trending ?? []}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        onTrailer={setTrailerMovie}
      />

      <ScrollRow
        title="Coming Soon"
        movies={data?.comingSoon ?? []}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        onTrailer={setTrailerMovie}
      />

      <ScrollRow
        title="Now in Theaters"
        movies={data?.nowPlaying ?? []}
        watchlistEntries={watchlistEntries}
        onAdd={setSelectedMovie}
        onTrailer={setTrailerMovie}
      />

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
