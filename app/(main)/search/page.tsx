"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MovieCard from "@/components/movies/MovieCard";
import type { TMDBMovie } from "@/lib/tmdb";
import toast from "react-hot-toast";

export default function SearchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!query.trim()) {
      toast.error("Please enter a search term");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/movies/search?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setMovies(data.results || []);

      if (data.results.length === 0) {
        toast("No movies found", { icon: "📽️" });
      }
    } catch (error) {
      toast.error("Failed to search movies. Please try again.");
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddToWatchlist = async (movieId: number) => {
    try {
      const response = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ movieId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add movie");
      }

      toast.success("Added to watchlist!");
    } catch (error: any) {
      toast.error(error.message || "Failed to add movie");
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4" style={{ color: "var(--primary)" }}>
          Search Movies
        </h1>

        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a movie..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {movies.map((movie) => (
            <MovieCard
              key={movie.id}
              id={movie.id}
              title={movie.title}
              posterPath={movie.poster_path}
              releaseDate={movie.release_date}
              overview={movie.overview}
            >
              <button
                onClick={() => handleAddToWatchlist(movie.id)}
                className="w-full px-4 py-2 text-white rounded-md transition-colors text-sm"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Add to Watchlist
              </button>
            </MovieCard>
          ))}
        </div>
      )}

      {!isLoading && movies.length === 0 && query && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            No results found. Try a different search term.
          </p>
        </div>
      )}
    </div>
  );
}
