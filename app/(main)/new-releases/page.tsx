"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import PosterCard from "@/components/ui/PosterCard";
import { isOnList, yearMeta } from "@/lib/posterCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import AddTVModal from "@/components/tv/AddTVModal";
import { SkeletonBlock, PosterSkeleton } from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
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
type TrailerTarget = Selected & { mediaType: "movie" | "tv" };

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
  onTrailer: (title: TrailerTarget) => void;
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
        className="flex gap-3 overflow-x-auto py-1 pb-3"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}
      >
        {visible.map((item) => {
          const selected = { id: item.id, title: item.title };
          const existing =
            item.mediaType === "movie" ? watchlistEntries[item.id] : tvEntries[item.id];
          return (
            <div key={`${item.mediaType}-${item.id}`} className="w-[150px] shrink-0">
              <PosterCard
                id={item.id}
                mediaType={item.mediaType}
                title={item.title}
                posterPath={item.posterPath}
                overview={item.overview}
                meta={yearMeta(item.date, item.mediaType)}
                onList={isOnList(existing?.status)}
                onAdd={() => (item.mediaType === "movie" ? onAddMovie : onAddTV)(selected)}
                onTrailer={() => onTrailer({ ...selected, mediaType: item.mediaType })}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function loadWatchlistEntries(): Promise<Record<number, WatchlistEntry> | null> {
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
      return entries;
    }
  } catch {
    // silently fail
  }
  return null;
}

async function loadTVEntries(): Promise<Record<number, TVEntry> | null> {
  try {
    const res = await fetch("/api/tv/watchlist");
    if (res.ok) {
      const data = await res.json();
      const entries: Record<number, TVEntry> = {};
      (data.entries || []).forEach((entry: TVEntry & { tvShowId: number }) => {
        entries[entry.tvShowId] = entry;
      });
      return entries;
    }
  } catch {
    // silently fail
  }
  return null;
}

export default function NewsPage() {
  const [data, setData] = useState<NewsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<MediaFilter>("both");
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [tvEntries, setTVEntries] = useState<Record<number, TVEntry>>({});
  const [selectedMovie, setSelectedMovie] = useState<Selected | null>(null);
  const [selectedShow, setSelectedShow] = useState<Selected | null>(null);
  const [trailerMovie, setTrailerMovie] = useState<TrailerTarget | null>(null);

  // Refresh after a mutation (called from event handlers).
  const fetchWatchlist = async () => {
    const entries = await loadWatchlistEntries();
    if (entries) setWatchlistEntries(entries);
  };

  const fetchTVEntries = async () => {
    const entries = await loadTVEntries();
    if (entries) setTVEntries(entries);
  };

  useEffect(() => {
    // Ignore responses that arrive after the page unmounted.
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/movies/news");
        if (!res.ok) throw new Error();
        const loaded = await res.json();
        if (!cancelled) {
          setData(loaded);
          setLoadFailed(false);
        }
      } catch {
        if (!cancelled) setLoadFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    try {
      const saved = localStorage.getItem("newReleasesFilter");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is an external system that doesn't exist during SSR; reading it in render or in the useState initializer would cause a hydration mismatch, so we sync it once after mount.
      if (saved === "movie" || saved === "tv" || saved === "both") setFilter(saved);
    } catch {
      // storage unavailable
    }

    load();
    loadWatchlistEntries().then((entries) => {
      if (!cancelled && entries) setWatchlistEntries(entries);
    });
    loadTVEntries().then((entries) => {
      if (!cancelled && entries) setTVEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setIsLoading(true);
    setAttempt((n) => n + 1);
  };

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
      <div className="max-w-7xl mx-auto p-6" role="status" aria-busy="true">
        <span className="sr-only">Loading new releases…</span>
        <SkeletonBlock className="mb-8 h-9 w-56" />
        {[0, 1].map((row) => (
          <div key={row} className="mb-8">
            <SkeletonBlock className="mb-3 h-6 w-40" />
            <div className="flex gap-4 overflow-hidden">
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="w-[150px] shrink-0">
                  <PosterSkeleton />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (loadFailed && !data) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
          New Releases
        </h1>
        <ErrorState title="Couldn't load new releases" onRetry={retry} />
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
          <a href="/profile" style={{ color: "var(--color-accent-text)" }}>
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
        mediaType={trailerMovie?.mediaType}
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
