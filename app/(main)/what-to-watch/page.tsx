"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import MoodControls, { MediaControl } from "@/components/mood/MoodControls";
import TVShowCard from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import {
  DEFAULT_SELECTION,
  candidateKey,
  moodSelectionToQuery,
  parseMoodSelection,
  pickRecommendations,
  refreshPicks,
  type MoodCandidate,
  type MoodPick,
  type MoodSelection,
} from "@/lib/moodPicker";

interface Entry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

interface PoolData {
  pool: MoodCandidate[];
  watchlist: Record<string, Entry>;
  exclude: string[];
  hasServices: boolean;
}

const PICK_COUNT = 5;

type Selected = { id: number; title: string };

function pick(data: PoolData, selection: MoodSelection, avoid?: MoodPick[]): MoodPick[] {
  return pickRecommendations(data.pool, {
    selection,
    watchlist: new Set(Object.keys(data.watchlist)),
    exclude: new Set(data.exclude),
    avoid: new Set((avoid ?? []).map(candidateKey)),
    count: PICK_COUNT,
  });
}

export default function WhatToWatchPage() {
  const [selection, setSelection] = useState<MoodSelection>(DEFAULT_SELECTION);
  const query = moodSelectionToQuery(selection);
  // The query the current pool was loaded for; loading is "pool is for an older query"
  const [loaded, setLoaded] = useState<{ query: string; data: PoolData } | null>(null);
  const [picks, setPicks] = useState<MoodPick[]>([]);
  const [reload, setReload] = useState(0);
  // Bumped by Retry so the same query is fetched again
  const [attempt, setAttempt] = useState(0);
  // The query whose load failed, so the page shows an error instead of "Loading…"
  const [failed, setFailed] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Selected | null>(null);
  const [selectedShow, setSelectedShow] = useState<Selected | null>(null);
  const [trailer, setTrailer] = useState<(Selected & { mediaType: "movie" | "tv" }) | null>(null);

  useEffect(() => {
    // Aborting stops a stale request (e.g. after quick chip clicks) instead of
    // just ignoring its response, so it stops costing TMDB calls server-side.
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/mood-picks?${query}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PoolData = await res.json();
        if (controller.signal.aborted) return;
        setFailed(null);
        setLoaded({ query, data });
        const sel = parseMoodSelection(new URLSearchParams(query));
        // A reload (after Add/Update) keeps the cards, refreshes their flags, and
        // swaps out any just marked watched or not interested
        setPicks((current) =>
          reload > 0
            ? refreshPicks(current, data.pool, {
                selection: sel,
                watchlist: new Set(Object.keys(data.watchlist)),
                exclude: new Set(data.exclude),
                count: PICK_COUNT,
              })
            : pick(data, sel)
        );
      } catch {
        if (controller.signal.aborted) return;
        // A failed refresh after Add/Update keeps the cards that are showing;
        // a failed load for a new selection shows the error with Retry
        if (reload > 0) toast.error("Couldn't refresh suggestions");
        else setFailed(query);
      }
    })();
    return () => controller.abort();
  }, [query, reload, attempt]);

  const hasError = failed === query;
  const isLoading = loaded?.query !== query && !hasError;
  const data = hasError ? undefined : loaded?.data;

  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };

  const update = (next: Partial<MoodSelection>) => {
    setReload(0);
    setSelection((s) => ({ ...s, ...next }));
  };

  const shuffle = () => {
    if (data) setPicks(pick(data, selection, picks));
  };

  // After adding/updating, refresh watchlist info but keep the cards on screen
  const refreshEntries = () => setReload((n) => n + 1);

  const watchlistEntry = (p: { id: number; mediaType: "movie" | "tv" }) =>
    data?.watchlist[candidateKey(p)];

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>
          What to Watch
        </h1>
        <MediaControl value={selection.media} onChange={(media) => update({ media })} />
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Pick a mood and we&apos;ll suggest a few titles — your watchlist first, nothing you&apos;ve already seen.
      </p>

      <MoodControls
        hideMedia
        value={selection}
        onChange={(next) => update(next)}
      />

      {selection.onMyServices && data && !data.hasServices && (
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Save your streaming services in{" "}
          <Link href="/profile" style={{ color: "var(--accent)" }}>
            Profile
          </Link>{" "}
          to filter by them — showing everything for now.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 mt-8 mb-4">
        <h2 className="text-lg font-bold" style={{ color: "var(--primary)" }}>
          Up next for you
        </h2>
        <button
          onClick={shuffle}
          disabled={isLoading || hasError || picks.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-white text-sm rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Shuffle
        </button>
      </div>

      {hasError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p style={{ color: "var(--text-muted)" }}>Couldn&apos;t load suggestions.</p>
          <button
            onClick={retry}
            className="px-4 py-1.5 text-sm rounded-md cursor-pointer transition-opacity hover:opacity-80"
            style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
          >
            Retry
          </button>
        </div>
      ) : isLoading && !data ? (
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      ) : picks.length === 0 && !isLoading ? (
        <p style={{ color: "var(--text-muted)" }}>
          Nothing matches all of those — try turning a mood off.
        </p>
      ) : (
        <div
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 transition-opacity"
          style={{ opacity: isLoading ? 0.5 : 1 }}
          aria-busy={isLoading}
        >
          {picks.map((p) => {
            const selected = { id: p.id, title: p.title };
            const addButton = (
              <button
                onClick={() => (p.mediaType === "movie" ? setSelectedMovie : setSelectedShow)(selected)}
                className="w-full px-2 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {watchlistEntry(p) ? "Update" : "Add"}
              </button>
            );
            const children = (
              <>
                <div className="flex items-start justify-between gap-1 text-xs">
                  {/* Same badge style as the search dropdown's Movie/TV tags */}
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  >
                    {p.mediaType === "movie" ? "Movie" : "TV"}
                  </span>
                  {p.onWatchlist && (
                    // Wraps rather than truncating on narrow (2-column) cards
                    <span className="text-right leading-tight" style={{ color: "var(--accent)" }}>
                      On your watchlist
                    </span>
                  )}
                </div>
                {addButton}
              </>
            );
            return (
              <div key={candidateKey(p)}>
                {p.mediaType === "movie" ? (
                  <MovieCard
                    id={p.id}
                    title={p.title}
                    posterPath={p.posterPath}
                    releaseDate={p.date}
                    overview={p.overview}
                    onPlayTrailer={() => setTrailer({ ...selected, mediaType: "movie" })}
                  >
                    {children}
                  </MovieCard>
                ) : (
                  <TVShowCard
                    id={p.id}
                    name={p.title}
                    posterPath={p.posterPath}
                    firstAirDate={p.date}
                    overview={p.overview}
                  >
                    {children}
                  </TVShowCard>
                )}
              </div>
            );
          })}
        </div>
      )}

      <TrailerModal
        movieId={trailer?.id ?? null}
        movieTitle={trailer?.title ?? ""}
        mediaType={trailer?.mediaType}
        onClose={() => setTrailer(null)}
      />

      {selectedMovie && (
        <AddMovieModal
          isOpen={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          movieId={selectedMovie.id}
          movieTitle={selectedMovie.title}
          existingEntry={watchlistEntry({ id: selectedMovie.id, mediaType: "movie" })}
          onSuccess={() => {
            setSelectedMovie(null);
            refreshEntries();
          }}
        />
      )}

      {selectedShow && (
        <AddTVModal
          isOpen={!!selectedShow}
          onClose={() => setSelectedShow(null)}
          tvShowId={selectedShow.id}
          tvShowName={selectedShow.title}
          existingEntry={watchlistEntry({ id: selectedShow.id, mediaType: "tv" })}
          onSuccess={() => {
            setSelectedShow(null);
            refreshEntries();
          }}
        />
      )}
    </div>
  );
}
