"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import TVShowCard from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import toast from "react-hot-toast";
import type { NewsItem, ServiceRow } from "@/app/api/movies/news/route";

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

interface TVEntry {
  id: string;
  status: string;
  platform?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

interface NewsData {
  services: ServiceRow[];
  rentOrBuy: NewsItem[];
  trending: NewsItem[];
  comingSoon: NewsItem[];
  nowPlaying: NewsItem[];
  airingNow: NewsItem[];
  personalizedStreaming: boolean;
}

type MediaFilter = "both" | "movie" | "tv";

const FILTERS: { value: MediaFilter; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
];

type Selected = { id: number; title: string };

function ScrollRow({
  title,
  logoPath,
  items,
  filter,
  watchlistEntries,
  tvEntries,
  onAddMovie,
  onAddTV,
  onTrailer,
}: {
  title: string;
  logoPath?: string | null;
  items: NewsItem[];
  filter: MediaFilter;
  watchlistEntries: Record<number, WatchlistEntry>;
  tvEntries: Record<number, TVEntry>;
  onAddMovie: (movie: Selected) => void;
  onAddTV: (show: Selected) => void;
  onTrailer: (movie: Selected) => void;
}) {
  const visible =
    filter === "both"
      ? [...items].sort((a, b) => b.popularity - a.popularity)
      : items.filter((item) => item.mediaType === filter);
  if (visible.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="flex items-center gap-2 text-lg font-bold mb-4" style={{ color: "var(--primary)" }}>
        {logoPath && (
          <Image
            src={`https://image.tmdb.org/t/p/w92${logoPath}`}
            alt=""
            width={28}
            height={28}
            className="rounded-md"
          />
        )}
        {title}
      </h2>
      <div
        className="flex gap-3 overflow-x-auto pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
      >
        {visible.map((item) => {
          const selected = { id: item.id, title: item.title };
          const existing =
            item.mediaType === "movie" ? watchlistEntries[item.id] : tvEntries[item.id];
          const addButton = (
            <button
              onClick={() => (item.mediaType === "movie" ? onAddMovie : onAddTV)(selected)}
              className="w-full px-2 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {existing ? "Update" : "Add"}
            </button>
          );
          return (
            <div key={`${item.mediaType}-${item.id}`} style={{ width: "160px", flexShrink: 0 }}>
              {item.mediaType === "movie" ? (
                <MovieCard
                  id={item.id}
                  title={item.title}
                  posterPath={item.posterPath}
                  releaseDate={item.date}
                  overview={item.overview}
                  onPlayTrailer={() => onTrailer(selected)}
                >
                  {addButton}
                </MovieCard>
              ) : (
                <TVShowCard
                  id={item.id}
                  name={item.title}
                  posterPath={item.posterPath}
                  firstAirDate={item.date}
                  overview={item.overview}
                  watchingStatus={tvEntries[item.id]?.status}
                >
                  {addButton}
                </TVShowCard>
              )}
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
  const [filter, setFilter] = useState<MediaFilter>("both");
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [tvEntries, setTVEntries] = useState<Record<number, TVEntry>>({});
  const [selectedMovie, setSelectedMovie] = useState<Selected | null>(null);
  const [selectedShow, setSelectedShow] = useState<Selected | null>(null);
  const [trailerMovie, setTrailerMovie] = useState<Selected | null>(null);

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

  const fetchTVEntries = async () => {
    try {
      const res = await fetch("/api/tv/watchlist");
      if (res.ok) {
        const data = await res.json();
        const entries: Record<number, TVEntry> = {};
        (data.entries || []).forEach((entry: TVEntry & { tvShowId: number }) => {
          entries[entry.tvShowId] = entry;
        });
        setTVEntries(entries);
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

    try {
      const saved = localStorage.getItem("newReleasesFilter");
      if (saved === "movie" || saved === "tv" || saved === "both") setFilter(saved);
    } catch {
      // storage unavailable
    }

    load();
    fetchWatchlist();
    fetchTVEntries();
  }, []);

  const changeFilter = (next: MediaFilter) => {
    setFilter(next);
    try {
      localStorage.setItem("newReleasesFilter", next);
    } catch {
      // storage unavailable
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  const rowProps = {
    filter,
    watchlistEntries,
    tvEntries,
    onAddMovie: setSelectedMovie,
    onAddTV: setSelectedShow,
    onTrailer: setTrailerMovie,
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>
          New Releases
        </h1>
        <div
          className="flex rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--border)" }}
          role="group"
          aria-label="Show movies, TV, or both"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => changeFilter(f.value)}
              aria-pressed={filter === f.value}
              className="px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors"
              style={
                filter === f.value
                  ? { backgroundColor: "var(--accent)", color: "white" }
                  : { color: "var(--text-muted)" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
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
          to see a row for each one
        </p>
      )}

      {data?.services.map((service) => (
        <ScrollRow
          key={service.id}
          title={data.personalizedStreaming ? `New on ${service.name}` : "New on Streaming"}
          logoPath={service.logoPath}
          items={service.items}
          {...rowProps}
        />
      ))}

      <ScrollRow title="New to Rent or Buy" items={data?.rentOrBuy ?? []} {...rowProps} />
      <ScrollRow title="Trending This Week" items={data?.trending ?? []} {...rowProps} />
      <ScrollRow title="Airing This Week" items={data?.airingNow ?? []} {...rowProps} />
      <ScrollRow title="Coming Soon" items={data?.comingSoon ?? []} {...rowProps} />
      <ScrollRow title="Now in Theaters" items={data?.nowPlaying ?? []} {...rowProps} />

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

      {selectedShow && (
        <AddTVModal
          isOpen={!!selectedShow}
          onClose={() => setSelectedShow(null)}
          tvShowId={selectedShow.id}
          tvShowName={selectedShow.title}
          existingEntry={tvEntries[selectedShow.id]}
          onSuccess={() => {
            setSelectedShow(null);
            fetchTVEntries();
          }}
        />
      )}
    </div>
  );
}
