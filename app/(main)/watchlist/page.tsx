"use client";

import { useEffect, useState } from "react";
import MovieCard from "@/components/movies/MovieCard";
import toast from "react-hot-toast";

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  addedAt: string;
  movie: {
    id: number;
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
    overview: string | null;
  };
}

export default function WatchlistPage() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWatchlist = async () => {
    try {
      const response = await fetch("/api/watchlist?status=WANT_TO_WATCH");
      if (!response.ok) throw new Error("Failed to fetch");

      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      toast.error("Failed to load watchlist");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWatchlist();
  }, []);

  const handleMarkAsWatched = async (entryId: string) => {
    try {
      const response = await fetch(`/api/watchlist/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "WATCHED",
          watchedAt: new Date().toISOString(),
        }),
      });

      if (!response.ok) throw new Error("Failed to update");

      toast.success("Marked as watched!");
      fetchWatchlist();
    } catch (error) {
      toast.error("Failed to update movie");
    }
  };

  const handleRemove = async (entryId: string) => {
    try {
      const response = await fetch(`/api/watchlist/${entryId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete");

      toast.success("Removed from watchlist");
      fetchWatchlist();
    } catch (error) {
      toast.error("Failed to remove movie");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
        Want to Watch
      </h1>

      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            Your watchlist is empty. Search for movies to add!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {entries.map((entry) => (
            <MovieCard
              key={entry.id}
              id={entry.movie.id}
              title={entry.movie.title}
              posterPath={entry.movie.posterPath}
              releaseDate={entry.movie.releaseDate || undefined}
              overview={entry.movie.overview || undefined}
            >
              <div className="space-y-2">
                <button
                  onClick={() => handleMarkAsWatched(entry.id)}
                  className="w-full px-4 py-2 text-white rounded-md transition-colors text-sm"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Mark as Watched
                </button>
                <button
                  onClick={() => handleRemove(entry.id)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-md transition-colors text-sm hover:bg-gray-50"
                  style={{ color: "var(--foreground)" }}
                >
                  Remove
                </button>
              </div>
            </MovieCard>
          ))}
        </div>
      )}
    </div>
  );
}
