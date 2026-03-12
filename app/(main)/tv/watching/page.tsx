"use client";

import { useState, useEffect, useCallback } from "react";
import TVShowCard from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import ThumbRating from "@/components/ui/ThumbRating";
import toast from "react-hot-toast";

type Tab = "watching" | "want" | "finished";

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

const STATUS_MAP: Record<Tab, string> = {
  watching: "WATCHING",
  want: "WANT_TO_WATCH",
  finished: "WATCHED",
};

const TAB_LABELS: Record<Tab, string> = {
  watching: "Watching",
  want: "Want to Watch",
  finished: "Finished",
};

const EMPTY_MESSAGES: Record<Tab, string> = {
  watching: "Nothing in progress. Find a show and mark it as Watching.",
  want: "Your TV watchlist is empty. Discover TV shows and add them here.",
  finished: "No finished shows yet.",
};

export default function MyTVPage() {
  const [activeTab, setActiveTab] = useState<Tab>("watching");
  const [entries, setEntries] = useState<TVEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [nextEpisodes, setNextEpisodes] = useState<Record<number, NextEpisodeInfo["next_episode_to_air"]>>({});
  const [selectedShow, setSelectedShow] = useState<TVEntry | null>(null);

  const fetchEntries = useCallback(async (tab: Tab) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/tv/watchlist?status=${STATUS_MAP[tab]}`);
      if (res.ok) {
        const data = await res.json();
        const loaded: TVEntry[] = data.entries || [];
        setEntries(loaded);
        return loaded;
      }
    } catch {
      toast.error("Failed to load TV shows");
    } finally {
      setIsLoading(false);
    }
    return [];
  }, []);

  useEffect(() => {
    setNextEpisodes({});
    fetchEntries(activeTab).then((loadedEntries: TVEntry[]) => {
      if (activeTab !== "watching" || loadedEntries.length === 0) return;
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
  }, [activeTab, fetchEntries]);

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
      fetchEntries(activeTab);
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

  const displayEntries =
    activeTab === "watching"
      ? [...entries].sort((a, b) => {
          const nextA = nextEpisodes[a.tvShowId];
          const nextB = nextEpisodes[b.tvShowId];
          if (nextA?.air_date && nextB?.air_date) {
            return new Date(nextA.air_date).getTime() - new Date(nextB.air_date).getTime();
          }
          if (nextA?.air_date) return -1;
          if (nextB?.air_date) return 1;
          return 0;
        })
      : entries;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
        My TV
      </h1>

      {/* Tab toggle */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg w-fit"
        style={{ backgroundColor: "var(--border)" }}
      >
        {(["watching", "want", "finished"] as Tab[]).map((tab) => (
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
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading...</p>
      ) : displayEntries.length === 0 ? (
        <div
          className="text-center py-16 rounded-xl"
          style={{ border: "1px dashed var(--border)" }}
        >
          <p style={{ color: "var(--text-muted)" }}>{EMPTY_MESSAGES[activeTab]}</p>
        </div>
      ) : (
        <>
          {/* Upcoming episodes (watching tab only) */}
          {activeTab === "watching" &&
            displayEntries.some((e) => {
              const next = nextEpisodes[e.tvShowId];
              return next?.air_date && daysUntil(next.air_date) !== null && daysUntil(next.air_date)! >= 0;
            }) && (
              <div className="mb-8">
                <h2
                  className="text-sm font-semibold uppercase tracking-wider mb-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  Upcoming Episodes
                </h2>
                <div className="space-y-3">
                  {displayEntries
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
                          style={{
                            backgroundColor: "color-mix(in srgb, var(--accent) 8%, var(--card-bg))",
                            border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--border))",
                          }}
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

          {/* Card grid */}
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
          >
            {displayEntries.map((entry) => {
              const next = activeTab === "watching" ? nextEpisodes[entry.tvShowId] : undefined;
              const days = next ? daysUntil(next?.air_date ?? null) : null;
              return (
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
                  {activeTab === "watching" && (
                    <>
                      {(entry.currentSeason || entry.currentEpisode) && (
                        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
                          {entry.currentSeason && `S${String(entry.currentSeason).padStart(2, "0")}`}
                          {entry.currentSeason && entry.currentEpisode && " "}
                          {entry.currentEpisode && `E${String(entry.currentEpisode).padStart(2, "0")}`}
                        </p>
                      )}
                      {next && (
                        <div
                          className="text-xs px-2 py-1 rounded text-center"
                          style={{
                            backgroundColor:
                              days !== null && days >= 0
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
                    </>
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
            fetchEntries(activeTab);
          }}
        />
      )}
    </div>
  );
}
