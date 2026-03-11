"use client";

import { useState, useEffect, useCallback } from "react";
import TVShowCard from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import ThumbRating from "@/components/ui/ThumbRating";
import toast from "react-hot-toast";

interface TVShow {
  id: number;
  name: string;
  posterPath: string | null;
  firstAirDate: string | null;
  overview: string | null;
}

interface TVEntry {
  id: string;
  tvShowId: number;
  status: string;
  platform?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
  tvShow: TVShow;
}

export default function TVWatchlistPage() {
  const [entries, setEntries] = useState<TVEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedShow, setSelectedShow] = useState<TVEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/tv/watchlist?status=WANT_TO_WATCH");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch {
      toast.error("Failed to load TV watchlist");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleRating = async (entry: TVEntry, rating: number) => {
    setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, rating: rating || null } : e));
    try {
      const res = await fetch(`/api/tv/watchlist/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: rating || null }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Failed to save rating");
      fetchEntries();
    }
  };

  const handleRemove = async (entry: TVEntry) => {
    try {
      await fetch(`/api/tv/watchlist/${entry.id}`, { method: "DELETE" });
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success("Removed");
    } catch {
      toast.error("Failed to remove");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>TV Watchlist</h1>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>TV Watchlist</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        {entries.length} show{entries.length !== 1 ? "s" : ""} to watch
      </p>

      {entries.length === 0 && (
        <div className="text-center py-16 rounded-xl" style={{ border: "1px dashed var(--border)" }}>
          <p className="text-lg font-medium mb-2" style={{ color: "var(--foreground)" }}>Your TV watchlist is empty</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Discover TV shows and add them here.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        >
          {entries.map((entry) => (
            <TVShowCard
              key={entry.id}
              id={entry.tvShowId}
              name={entry.tvShow.name}
              posterPath={entry.tvShow.posterPath}
              firstAirDate={entry.tvShow.firstAirDate ?? undefined}
              overview={entry.tvShow.overview ?? undefined}
              watchingStatus={entry.status}
              thumbRating={
                <ThumbRating
                  rating={entry.rating || 0}
                  onChange={(r) => handleRating(entry, r)}
                  showLabels={false}
                />
              }
            >
              <div className="flex gap-2">
                <button
                  onClick={() => setSelectedShow(entry)}
                  className="flex-1 px-3 py-1.5 text-white rounded-md text-xs cursor-pointer hover:opacity-90 hover:scale-105 transition-all"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Update
                </button>
                <button
                  onClick={() => handleRemove(entry)}
                  className="px-3 py-1.5 rounded-md text-xs cursor-pointer hover:opacity-90 transition-all"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                >
                  Remove
                </button>
              </div>
            </TVShowCard>
          ))}
        </div>
      )}

      {selectedShow && (
        <AddTVModal
          isOpen={!!selectedShow}
          onClose={() => setSelectedShow(null)}
          tvShowId={selectedShow.tvShowId}
          tvShowName={selectedShow.tvShow.name}
          existingEntry={selectedShow}
          onSuccess={() => {
            setSelectedShow(null);
            fetchEntries();
          }}
        />
      )}
    </div>
  );
}
