"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

function SearchPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<{ id: number; title: string } | null>(null);
  const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [trailerMovie, setTrailerMovie] = useState<{ id: number; title: string } | null>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      const [wantRes, watchedRes] = await Promise.all([
        fetch("/api/watchlist?status=WANT_TO_WATCH"),
        fetch("/api/watchlist?status=WATCHED"),
      ]);

      if (wantRes.ok && watchedRes.ok) {
        const [wantData, watchedData] = await Promise.all([
          wantRes.json(),
          watchedRes.json(),
        ]);

        const entries: Record<number, WatchlistEntry> = {};
        [...(wantData.entries || []), ...(watchedData.entries || [])].forEach((entry: any) => {
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

  // Load popular movies and watchlist on initial mount
  useEffect(() => {
    const loadPopularMovies = async () => {
      try {
        setIsLoading(true);
        const randomPage = Math.floor(Math.random() * 5) + 1;
        const response = await fetch(`/api/movies/popular?page=${randomPage}`);

        if (response.ok) {
          const data = await response.json();
          // Shuffle so order differs each load too
          const shuffled = (data.results || []).sort(() => Math.random() - 0.5);
          setMovies(shuffled);
        }
      } catch (error) {
        console.error("Failed to load popular movies:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPopularMovies();
    fetchWatchlist();
  }, [fetchWatchlist]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (query.trim().length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      try {
        const response = await fetch(
          `/api/movies/search?q=${encodeURIComponent(query)}`
        );

        if (response.ok) {
          const data = await response.json();
          const sortedResults = (data.results || []).sort((a: TMDBMovie, b: TMDBMovie) =>
            b.popularity - a.popularity
          ).slice(0, 5);
          setSuggestions(sortedResults);
          setShowSuggestions(true);
        }
      } catch (error) {
        console.error("Suggestion fetch error:", error);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [query]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) {
      toast.error("Please enter a search term");
      return;
    }

    setShowSuggestions(false);
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/movies/search?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      const sortedResults = (data.results || []).sort((a: TMDBMovie, b: TMDBMovie) =>
        b.popularity - a.popularity
      );
      setMovies(sortedResults);

      if (data.results.length === 0) {
        toast.error("No movies found for your search");
      }
    } catch (error) {
      toast.error("Failed to search movies. Please try again.");
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = async (movie: TMDBMovie) => {
    setQuery(movie.title);
    setShowSuggestions(false);
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/movies/search?q=${encodeURIComponent(movie.title)}`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      const sortedResults = (data.results || []).sort((a: TMDBMovie, b: TMDBMovie) =>
        b.popularity - a.popularity
      );
      setMovies(sortedResults);
    } catch (error) {
      toast.error("Failed to search movies. Please try again.");
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (movieId: number, title: string) => {
    setSelectedMovie({ id: movieId, title });
  };

  const handleCloseModal = () => {
    setSelectedMovie(null);
  };

  const handleSuccess = () => {
    setSelectedMovie(null);
    fetchWatchlist();
  };

  const handleRating = async (movieId: number, rating: number) => {
    const entry = watchlistEntries[movieId];
    if (entry) {
      // Update existing entry
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
      // Auto-add as Watched with this rating
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

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4" style={{ color: "var(--primary)" }}>
          {query ? "Search Results" : "Popular Movies"}
        </h1>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true);
              }}
              onBlur={() => {
                setTimeout(() => setShowSuggestions(false), 200);
              }}
              placeholder="Search for a movie..."
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)] bg-[var(--card-bg)]"
              style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((movie) => (
                  <button
                    key={movie.id}
                    type="button"
                    onClick={() => handleSuggestionClick(movie)}
                    className="w-full px-4 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-3"
                  >
                    <span className="font-medium" style={{ color: "var(--primary)" }}>
                      {movie.title}
                    </span>
                    {movie.release_date && (
                      <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                        ({new Date(movie.release_date).getFullYear()})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-2 text-white rounded-md transition-colors disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {isLoading ? "Searching..." : "Search"}
          </button>
        </form>
      </div>

      {isLoading && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>Searching...</p>
        </div>
      )}

      {!isLoading && movies.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {movies.filter((movie) => query ? true : !watchlistEntries[movie.id]).map((movie) => {
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
              >
                <div className="space-y-1.5">
                <button
                  onClick={() => handleOpenModal(movie.id, movie.title)}
                  className="w-full px-3 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                  style={{ backgroundColor: existingEntry ? "var(--primary)" : "var(--accent)" }}
                >
                  {existingEntry ? "Update" : "Add"}
                </button>
                <ThumbRating
                  rating={existingEntry?.rating || 0}
                  onChange={(r) => handleRating(movie.id, r)}
                  showLabels={false}
                />
              </div>
              </MovieCard>
            );
          })}
        </div>
      )}

      {!isLoading && movies.length === 0 && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            {query ? "No results found. Try a different search term." : "No movies available."}
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
          onClose={handleCloseModal}
          movieId={selectedMovie.id}
          movieTitle={selectedMovie.title}
          existingEntry={watchlistEntries[selectedMovie.id]}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6"><p style={{ color: "var(--text-muted)" }}>Loading...</p></div>}>
      <SearchPageInner />
    </Suspense>
  );
}
