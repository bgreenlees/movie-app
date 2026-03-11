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

interface NextEpisodeInfo {
  tvShowId: number;
  next_episode_to_air: {
    name: string;
    air_date: string | null;
    episode_number: number;
    season_number: number;
  } | null;
}

function formatAirDate(dateStr: string | null) {
  if (!dateStr) return "TBA";
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export default function WatchingPage() {
  const [entries, setEntries] = useState<TVEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextEpisodes, setNextEpisodes] = useState<Record<number, NextEpisodeInfo["next_episode_to_air"]>>({});
  const [selectedShow, setSelectedShow] = useState<TVEntry | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/tv/watchlist?status=WATCHING");
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
        return data.entries || [];
      }
    } catch {
      toast.error("Failed to load watching list");
    } finally {
      setIsLoading(false);
    }
    return [];
  }, []);

  useEffect(() => {
    fetchEntries().then((loadedEntries: TVEntry[]) => {
      // Fetch next episode info for all watching shows in parallel
      if (loadedEntries.length === 0) return;
      Promise.allSettled(
        loadedEntries.map((entry) =>
          fetch(`/api/tv/${entry.tvShowId}/credits`)
            .then((r) => r.json())
            .then((data) => ({ tvShowId: entry.tvShowId, next_episode_to_air: data.next_episode_to_air ?? null }))
        )
      ).then((results) => {
        const map: Record<number, NextEpisodeInfo["next_episode_to_air"]> = {};
        results.forEach((r) => {
          if (r.status === "fulfilled") {
            map[r.value.tvShowId] = r.value.next_episode_to_air;
          }
        });
        setNextEpisodes(map);
      });
    });
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
        <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>Currently Watching</h1>
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      </div>
    );
  }

  // Sort: shows with upcoming episodes first (soonest), then no-next-ep shows
  const sortedEntries = [...entries].sort((a, b) => {
    const nextA = nextEpisodes[a.tvShowId];
    const nextB = nextEpisodes[b.tvShowId];
    if (nextA?.air_date && nextB?.air_date) {
      return new Date(nextA.air_date).getTime() - new Date(nextB.air_date).getTime();
    }
    if (nextA?.air_date) return -1;
    if (nextB?.air_date) return 1;
    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>Currently Watching</h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        {entries.length} show{entries.length !== 1 ? "s" : ""} in progress
      </p>

      {entries.length === 0 && (
        <div className="text-center py-16 rounded-xl" style={{ border: "1px dashed var(--border)" }}>
          <p className="text-lg font-medium mb-2" style={{ color: "var(--foreground)" }}>Nothing in progress</p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Go to TV Shows, find a show and mark it as &ldquo;Watching&rdquo;.
          </p>
        </div>
      )}

      {sortedEntries.length > 0 && (
        <>
          {/* Next up — shows with upcoming episodes */}
          {sortedEntries.some((e) => {
            const next = nextEpisodes[e.tvShowId];
            return next?.air_date && daysUntil(next.air_date) !== null && daysUntil(next.air_date)! >= 0;
          }) && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
                Upcoming Episodes
              </h2>
              <div className="space-y-3">
                {sortedEntries
                  .filter((e) => {
                    const next = nextEpisodes[e.tvShowId];
                    return next?.air_date && daysUntil(next.air_date) !== null && daysUntil(next.air_date)! >= 0;
                  })
                  .map((entry) => {
                    const next = nextEpisodes[entry.tvShowId];
                    const days = daysUntil(next?.air_date ?? null);
                    return (
                      <div
                        key={entry.id}
                        className="flex items-center gap-4 px-4 py-3 rounded-lg"
                        style={{ backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--card-bg))", border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))" }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                            {entry.tvShow.name}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                            S{String(next!.season_number).padStart(2, "0")}E{String(next!.episode_number).padStart(2, "0")} — {next!.name}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                            {days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days} days`}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {formatAirDate(next!.air_date ?? null)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Grid of all watching shows */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {sortedEntries.map((entry) => {
              const next = nextEpisodes[entry.tvShowId];
              const days = daysUntil(next?.air_date ?? null);
              return (
                <TVShowCard
                  key={entry.id}
                  id={entry.tvShowId}
                  name={entry.tvShow.name}
                  posterPath={entry.tvShow.posterPath}
                  firstAirDate={entry.tvShow.firstAirDate ?? undefined}
                  overview={entry.tvShow.overview ?? undefined}
                  watchingStatus="WATCHING"
                  thumbRating={
                    <ThumbRating
                      rating={entry.rating || 0}
                      onChange={(r) => handleRating(entry, r)}
                      showLabels={false}
                    />
                  }
                >
                  {/* Progress indicator */}
                  {(entry.currentSeason || entry.currentEpisode) && (
                    <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                      {entry.currentSeason && `S${String(entry.currentSeason).padStart(2, "0")}`}
                      {entry.currentSeason && entry.currentEpisode && " "}
                      {entry.currentEpisode && `E${String(entry.currentEpisode).padStart(2, "0")}`}
                    </p>
                  )}

                  {/* Next episode badge */}
                  {next && (
                    <div
                      className="text-xs px-2 py-1 rounded text-center"
                      style={{
                        backgroundColor: days !== null && days >= 0
                          ? "color-mix(in srgb, var(--accent) 15%, var(--card-bg))"
                          : "var(--border)",
                        color: days !== null && days >= 0 ? "var(--accent)" : "var(--text-muted)",
                      }}
                    >
                      {days !== null && days >= 0 ? (
                        <>
                          Next: S{String(next.season_number).padStart(2, "0")}E{String(next.episode_number).padStart(2, "0")}
                          {" · "}{days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days}d`}
                        </>
                      ) : (
                        <>
                          S{String(next.season_number).padStart(2, "0")}E{String(next.episode_number).padStart(2, "0")}
                          {next.air_date && ` · ${formatAirDate(next.air_date)}`}
                        </>
                      )}
                    </div>
                  )}

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
              );
            })}
          </div>
        </>
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
