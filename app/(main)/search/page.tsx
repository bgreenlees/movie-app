"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import ThumbRating from "@/components/ui/ThumbRating";
import type { TMDBMovie } from "@/lib/tmdb";
import toast from "react-hot-toast";

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

function DiscoverPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlQuery = searchParams.get("q") || "";

  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<{ id: number; title: string } | null>(null);
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [trailerMovie, setTrailerMovie] = useState<{ id: number; title: string } | null>(null);
  const [columns, setColumns] = useState(6);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const [wantRes, watchedRes, notInterestedRes] = await Promise.all([
        fetch("/api/watchlist?status=WANT_TO_WATCH"),
        fetch("/api/watchlist?status=WATCHED"),
        fetch("/api/watchlist?status=NOT_INTERESTED"),
      ]);
      if (wantRes.ok && watchedRes.ok && notInterestedRes.ok) {
        const [wantData, watchedData, notInterestedData] = await Promise.all([
          wantRes.json(), watchedRes.json(), notInterestedRes.json(),
        ]);
        const entries: Record<number, WatchlistEntry> = {};
        [
          ...(wantData.entries || []),
          ...(watchedData.entries || []),
          ...(notInterestedData.entries || []),
        ].forEach((entry: any) => {
          entries[entry.movieId] = {
            id: entry.id,
            movieId: entry.movieId,
            status: entry.status,
            platform: entry.platform,
            watchType: entry.watchType,
            rating: entry.rating,
            review: entry.review,
          };
        });
        setWatchlistEntries(entries);
      }
    } catch (error) {
      console.error("Failed to fetch watchlist:", error);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  // Onboarding gate — redirect new users before they see Discover
  useEffect(() => {
    fetch("/api/user")
      .then((r) => r.json())
      .then((d) => {
        if (!d.hasCompletedOnboarding) router.push("/onboarding");
      })
      .catch(() => {});
  }, [router]);

  // React to URL query changes — search or load popular
  useEffect(() => {
    if (urlQuery) {
      const fetchResults = async () => {
        setIsLoading(true);
        try {
          const response = await fetch(`/api/movies/search?q=${encodeURIComponent(urlQuery)}`);
          if (response.ok) {
            const data = await response.json();
            setMovies(
              (data.results || []).sort((a: TMDBMovie, b: TMDBMovie) => b.popularity - a.popularity)
            );
            if (!data.results?.length) toast.error("No movies found");
          } else {
            toast.error("Search failed");
          }
        } catch {
          toast.error("Search failed");
        } finally {
          setIsLoading(false);
        }
      };
      fetchResults();
    } else {
      const loadMovies = async () => {
        setIsLoading(true);
        try {
          // Try personalized recommendations first
          const recRes = await fetch("/api/movies/recommended");
          if (recRes.ok) {
            const recData = await recRes.json();
            if (recData.personalized && recData.results.length >= 6) {
              setMovies(recData.results);
              setIsPersonalized(true);
              setIsLoading(false);
              return;
            }
          }
          // Fall back to contextual (time-of-day genre feed)
          setIsPersonalized(false);
          const ctxRes = await fetch("/api/movies/contextual");
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json();
            setMovies((ctxData.results || []).sort(() => Math.random() - 0.5));
            // Show nudge if user has no watchlist entries (they skipped onboarding)
            setShowNudge(true);
          } else {
            toast.error("Failed to load movies");
          }
        } catch {
          toast.error("Failed to load movies");
        } finally {
          setIsLoading(false);
        }
      };
      loadMovies();
    }
  }, [urlQuery]);

  useEffect(() => {
    if (!gridRef.current) return;
    const obs = new ResizeObserver(() => {
      if (gridRef.current) {
        const cols = getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").length;
        setColumns(cols);
      }
    });
    obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, [movies]);

  const handleRating = async (movieId: number, rating: number) => {
    const entry = watchlistEntries[movieId];
    if (entry) {
      setWatchlistEntries((prev) => ({
        ...prev,
        [movieId]: { ...entry, rating: rating || null },
      }));
      try {
        const response = await fetch(`/api/watchlist/${entry.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rating: rating || null }),
        });
        if (!response.ok) throw new Error();
      } catch {
        toast.error("Failed to save rating");
        fetchWatchlist();
      }
    } else if (rating > 0) {
      try {
        const response = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId, status: "WATCHED", rating }),
        });
        if (!response.ok) throw new Error();
        fetchWatchlist();
      } catch {
        toast.error("Failed to save rating");
      }
    }
  };

  const handleNotInterested = async (movieId: number) => {
    const entry = watchlistEntries[movieId];
    if (entry?.status === "NOT_INTERESTED") {
      // Toggle off — remove the entry
      try {
        await fetch(`/api/watchlist/${entry.id}`, { method: "DELETE" });
        fetchWatchlist();
      } catch {
        toast.error("Failed to update");
      }
    } else if (!entry) {
      // Mark as not interested
      try {
        const response = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ movieId, status: "NOT_INTERESTED" }),
        });
        if (!response.ok) throw new Error();
        fetchWatchlist();
      } catch {
        toast.error("Failed to update");
      }
    }
  };

  const filteredMovies = movies.filter((movie) =>
    urlQuery ? true : !watchlistEntries[movie.id]
  );
  const displayMovies = urlQuery
    ? filteredMovies
    : filteredMovies.slice(0, Math.floor(filteredMovies.length / columns) * columns || filteredMovies.length);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
        {urlQuery ? `Results for "${urlQuery}"` : isPersonalized ? "Recommended for You" : "Discover"}
      </h1>

      {showNudge && !nudgeDismissed && !urlQuery && (
        <div
          className="flex items-center justify-between gap-4 px-4 py-3 mb-6 rounded-lg border text-sm"
          style={{ borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 10%, var(--card-bg))" }}
        >
          <span style={{ color: "var(--foreground)" }}>
            ✨ Get personalised picks —{" "}
            <Link href="/onboarding" className="font-semibold underline" style={{ color: "var(--accent)" }}>
              tell us what you love
            </Link>
          </span>
          <button onClick={() => setNudgeDismissed(true)} style={{ color: "var(--text-muted)" }} aria-label="Dismiss">✕</button>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      )}

      {!isLoading && displayMovies.length > 0 && (
        <div
          ref={gridRef}
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {displayMovies
            .map((movie) => {
              const existingEntry = watchlistEntries[movie.id];
              return (
                <MovieCard
                  key={movie.id}
                  id={movie.id}
                  title={movie.title}
                  posterPath={movie.poster_path}
                  releaseDate={movie.release_date}
                  overview={movie.overview}
                  rating={movie.vote_average}
                  onPlayTrailer={(id) => setTrailerMovie({ id, title: movie.title })}
                  thumbRating={
                    <ThumbRating
                      rating={existingEntry?.rating || 0}
                      onChange={(r) => handleRating(movie.id, r)}
                      showLabels={false}
                      notInterested={existingEntry?.status === "NOT_INTERESTED"}
                      onNotInterested={() => handleNotInterested(movie.id)}
                    />
                  }
                >
                  <button
                    onClick={() => setSelectedMovie({ id: movie.id, title: movie.title })}
                    className="w-full px-3 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {existingEntry ? "Update" : "Add"}
                  </button>
                </MovieCard>
              );
            })}
        </div>
      )}

      {!isLoading && displayMovies.length === 0 && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            {urlQuery ? "No results found. Try a different search term." : "No movies available."}
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

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6"><p style={{ color: "var(--text-muted)" }}>Loading...</p></div>}>
      <DiscoverPageInner />
    </Suspense>
  );
}
