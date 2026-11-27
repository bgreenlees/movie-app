"use client";

import { useEffect, useState } from "react";
import PosterCard, { POSTER_GRID } from "@/components/ui/PosterCard";
import { statusChip, yearMeta } from "@/lib/posterCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import toast from "react-hot-toast";

type Tab = "want" | "watched";

interface WatchlistEntry {
  id: string;
  movieId: number;
  status: string;
  addedAt: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
  movie: {
    id: number;
    title: string;
    posterPath: string | null;
    releaseDate: string | null;
    overview: string | null;
  };
}

// Returns null (after toasting) when the request fails.
async function loadEntries(tab: Tab): Promise<WatchlistEntry[] | null> {
  try {
    const status = tab === "want" ? "WANT_TO_WATCH" : "WATCHED";
    const response = await fetch(`/api/watchlist?status=${status}`);
    if (!response.ok) throw new Error("Failed to fetch");
    const data = await response.json();
    return data.entries || [];
  } catch (error) {
    toast.error("Failed to load movies");
    console.error(error);
    return null;
  }
}

export default function MyMoviesPage() {
  const [activeTab, setActiveTab] = useState<Tab>("want");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEntry, setSelectedEntry] = useState<WatchlistEntry | null>(null);
  const [trailerMovie, setTrailerMovie] = useState<{ id: number; title: string } | null>(null);

  // Reset the spinner while rendering when the tab changes
  // (https://react.dev/learn/you-might-not-need-an-effect), not in the effect.
  const [prevTab, setPrevTab] = useState(activeTab);
  if (prevTab !== activeTab) {
    setPrevTab(activeTab);
    setIsLoading(true);
  }

  // Refresh after a mutation (called from event handlers); shows the spinner like a tab switch.
  const fetchEntries = async (tab: Tab) => {
    setIsLoading(true);
    const loaded = await loadEntries(tab);
    if (loaded) setEntries(loaded);
    setIsLoading(false);
  };

  useEffect(() => {
    // Ignore responses that arrive after the tab changed or the page unmounted.
    let cancelled = false;
    loadEntries(activeTab).then((loaded) => {
      if (cancelled) return;
      if (loaded) setEntries(loaded);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleRating = async (entryId: string, rating: number) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entryId ? { ...e, rating: rating || null } : e))
    );
    try {
      const response = await fetch(`/api/watchlist/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating || null }),
      });
      if (!response.ok) throw new Error();
    } catch {
      toast.error("Failed to save rating");
      fetchEntries(activeTab);
    }
  };

  const handleNotInterested = async (entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    try {
      const response = await fetch(`/api/watchlist/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NOT_INTERESTED" }),
      });
      if (!response.ok) throw new Error();
    } catch {
      toast.error("Failed to update");
      fetchEntries(activeTab);
    }
  };

  const handleRemove = async (entryId: string) => {
    try {
      const response = await fetch(`/api/watchlist/${entryId}`, { method: "DELETE" });
      if (!response.ok) throw new Error();
      toast.success("Removed");
      fetchEntries(activeTab);
    } catch {
      toast.error("Failed to remove movie");
    }
  };

  const emptyMessage =
    activeTab === "want"
      ? "Your watchlist is empty. Search for movies to add!"
      : "You haven't marked any movies as watched yet.";

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
        My Movies
      </h1>

      {/* Tab toggle */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
        style={{ backgroundColor: "var(--border)" }}
      >
        {(["want", "watched"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
            style={{
              backgroundColor: activeTab === tab ? "var(--card-bg)" : "transparent",
              color: activeTab === tab ? "var(--foreground)" : "var(--text-muted)",
              boxShadow: activeTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            {tab === "want" ? "Want to Watch" : "Watched"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>{emptyMessage}</p>
        </div>
      ) : (
        <div className={POSTER_GRID}>
          {entries.map((entry) => (
            <PosterCard
              key={entry.id}
              id={entry.movie.id}
              mediaType="movie"
              title={entry.movie.title}
              posterPath={entry.movie.posterPath}
              overview={entry.movie.overview ?? undefined}
              meta={yearMeta(entry.movie.releaseDate, "movie")}
              statusChip={statusChip(entry.status, entry.rating)}
              onList
              onAdd={() => setSelectedEntry(entry)}
              rating={entry.rating || 0}
              onRate={(r) => handleRating(entry.id, r)}
              onNotInterested={() => handleNotInterested(entry.id)}
              onTrailer={() => setTrailerMovie({ id: entry.movie.id, title: entry.movie.title })}
              onRemove={() => handleRemove(entry.id)}
            />
          ))}
        </div>
      )}

      <TrailerModal
        movieId={trailerMovie?.id ?? null}
        movieTitle={trailerMovie?.title ?? ""}
        onClose={() => setTrailerMovie(null)}
      />

      {selectedEntry && (
        <AddMovieModal
          isOpen={!!selectedEntry}
          onClose={() => setSelectedEntry(null)}
          movieId={selectedEntry.movieId}
          movieTitle={selectedEntry.movie.title}
          existingEntry={{
            id: selectedEntry.id,
            status: selectedEntry.status,
            platform: selectedEntry.platform,
            watchType: selectedEntry.watchType,
            rating: selectedEntry.rating,
            review: selectedEntry.review,
          }}
          onSuccess={() => {
            setSelectedEntry(null);
            fetchEntries(activeTab);
          }}
        />
      )}
    </div>
  );
}
