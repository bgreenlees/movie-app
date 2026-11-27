"use client";

import { useState, useEffect, useCallback } from "react";
import PosterCard, { POSTER_GRID } from "@/components/ui/PosterCard";
import { episodeMeta, seasonProgress, statusChip, yearMeta } from "@/lib/posterCard";
import TrailerModal from "@/components/movies/TrailerModal";
import AddTVModal from "@/components/tv/AddTVModal";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
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
  /** Episodes per season, for the card's progress bar. */
  episodeCounts: Record<number, number>;
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

const EMPTY_STATES: Record<Tab, { title: string; body: string; action: { label: string; href: string } }> = {
  watching: {
    title: "Nothing in progress",
    body: "Find a show and mark it as Watching to track your next episodes here.",
    action: { label: "Browse TV shows", href: "/tv" },
  },
  want: {
    title: "Your TV watchlist is empty",
    body: "Discover TV shows and add them here.",
    action: { label: "Browse TV shows", href: "/tv" },
  },
  finished: {
    title: "No finished shows yet",
    body: "Shows you finish show up here.",
    action: { label: "Browse TV shows", href: "/tv" },
  },
};

// Returns null (after toasting) when the request fails.
async function loadEntries(tab: Tab): Promise<TVEntry[] | null> {
  try {
    const res = await fetch(`/api/tv/watchlist?status=${STATUS_MAP[tab]}`);
    if (res.ok) {
      const data = await res.json();
      return data.entries || [];
    }
    toast.error("Failed to load TV shows");
  } catch {
    toast.error("Failed to load TV shows");
  }
  return null;
}

export default function MyTVPage() {
  const [activeTab, setActiveTab] = useState<Tab>("watching");
  const [entries, setEntries] = useState<TVEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [nextEpisodes, setNextEpisodes] = useState<Record<number, NextEpisodeInfo["next_episode_to_air"]>>({});
  const [episodeCounts, setEpisodeCounts] = useState<Record<number, NextEpisodeInfo["episodeCounts"]>>({});
  const [trailer, setTrailer] = useState<{ id: number; title: string } | null>(null);
  const [selectedShow, setSelectedShow] = useState<TVEntry | null>(null);

  // Reset per-tab state while rendering, when the tab changes
  // (https://react.dev/learn/you-might-not-need-an-effect), not in the effect.
  const [prevTab, setPrevTab] = useState(activeTab);
  if (prevTab !== activeTab) {
    setPrevTab(activeTab);
    setNextEpisodes({});
    setEpisodeCounts({});
    setIsLoading(true);
    setLoadFailed(false);
  }

  // Refresh after a mutation (called from event handlers); shows the spinner like a tab switch.
  const fetchEntries = useCallback(async (tab: Tab) => {
    setIsLoading(true);
    const loaded = await loadEntries(tab);
    if (loaded) setEntries(loaded);
    setLoadFailed(!loaded);
    setIsLoading(false);
    return loaded ?? [];
  }, []);

  useEffect(() => {
    // Ignore responses that arrive after the tab changed or the page unmounted.
    let cancelled = false;
    loadEntries(activeTab).then((loaded) => {
      if (cancelled) return;
      if (loaded) setEntries(loaded);
      setLoadFailed(!loaded);
      setIsLoading(false);
      if (activeTab !== "watching" || !loaded || loaded.length === 0) return;
      Promise.allSettled(
        loaded.map((entry) =>
          fetch(`/api/tv/${entry.tvShowId}/credits`)
            .then((r) => r.json())
            .then((data): NextEpisodeInfo => ({
              tvShowId: entry.tvShowId,
              next_episode_to_air: data.next_episode_to_air ?? null,
              episodeCounts: Object.fromEntries(
                (Array.isArray(data.seasons) ? data.seasons : []).map(
                  (season: { season_number: number; episode_count: number }) => [season.season_number, season.episode_count]
                )
              ),
            }))
        )
      ).then((results) => {
        if (cancelled) return;
        const map: Record<number, NextEpisodeInfo["next_episode_to_air"]> = {};
        const counts: Record<number, NextEpisodeInfo["episodeCounts"]> = {};
        results.forEach((r) => {
          if (r.status === "fulfilled") {
            map[r.value.tvShowId] = r.value.next_episode_to_air;
            counts[r.value.tvShowId] = r.value.episodeCounts;
          }
        });
        setNextEpisodes(map);
        setEpisodeCounts(counts);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

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
        <Skeleton label="Loading your shows" />
      ) : loadFailed ? (
        <ErrorState title="Couldn't load your shows" onRetry={() => fetchEntries(activeTab)} />
      ) : displayEntries.length === 0 ? (
        <EmptyState icon="📺" {...EMPTY_STATES[activeTab]} />
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
                            <p className="text-sm font-semibold" style={{ color: "var(--color-accent-text)" }}>
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
          <div className={POSTER_GRID}>
            {displayEntries.map((entry) => {
              const watching = activeTab === "watching";
              const next = watching ? nextEpisodes[entry.tvShowId] : undefined;
              const days = next ? daysUntil(next?.air_date ?? null) : null;
              const progress =
                watching && entry.currentSeason
                  ? seasonProgress(entry.currentEpisode, episodeCounts[entry.tvShowId]?.[entry.currentSeason])
                  : null;
              const nextCode = next
                ? `S${String(next.season_number).padStart(2, "0")}E${String(next.episode_number).padStart(2, "0")}`
                : "";
              return (
                <PosterCard
                  key={entry.id}
                  id={entry.tvShowId}
                  mediaType="tv"
                  title={entry.tvShow.name}
                  posterPath={entry.tvShow.posterPath}
                  overview={entry.tvShow.overview ?? undefined}
                  meta={
                    (watching ? episodeMeta(entry.currentSeason, entry.currentEpisode) : null) ??
                    yearMeta(entry.tvShow.firstAirDate, "tv")
                  }
                  progress={progress}
                  statusChip={statusChip(entry.status, entry.rating)}
                  onList
                  onAdd={() => setSelectedShow(entry)}
                  onTrailer={() => setTrailer({ id: entry.tvShowId, title: entry.tvShow.name })}
                >
                  {next && (
                    <p
                      className={`mt-1 text-[13px] leading-[18px] ${
                        days !== null && days >= 0 ? "text-accent-text" : "text-muted"
                      }`}
                    >
                      {days !== null && days >= 0
                        ? `Next: ${nextCode} · ${days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days}d`}`
                        : `${nextCode}${next.air_date ? ` · ${formatAirDate(next.air_date)}` : ""}`}
                    </p>
                  )}
                </PosterCard>
              );
            })}
          </div>
        </>
      )}

      <TrailerModal
        movieId={trailer?.id ?? null}
        movieTitle={trailer?.title ?? ""}
        mediaType="tv"
        onClose={() => setTrailer(null)}
      />

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
