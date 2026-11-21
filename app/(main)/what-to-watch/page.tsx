"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import TVShowCard from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import {
  DEFAULT_SELECTION,
  candidateKey,
  moodSelectionToQuery,
  parseMoodSelection,
  pickRecommendations,
  type MediaChoice,
  type MoodCandidate,
  type MoodPick,
  type MoodSelection,
  type TimeAvailable,
  type Vibe,
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

const MEDIA: { value: MediaChoice; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "movie", label: "Movies" },
  { value: "tv", label: "TV" },
];

const VIBES: { value: Exclude<Vibe, "any">; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "heavy", label: "Heavy" },
  { value: "intense", label: "Intense" },
];

// One runtime limit for films and single episodes alike
const TIMES: { value: Exclude<TimeAvailable, "any">; label: string }[] = [
  { value: "30", label: "~30 min" },
  { value: "120", label: "Under 2 hrs" },
];

const TOGGLES: { key: "fresh" | "onMyServices"; label: string }[] = [
  { key: "fresh", label: "Something new" },
  { key: "onMyServices", label: "On my services" },
];

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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 rounded-full text-sm cursor-pointer transition-colors hover:opacity-80"
      style={
        active
          ? {
              backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))",
              color: "var(--accent)",
              border: "1px solid var(--accent)",
            }
          : { color: "var(--foreground)", border: "1px solid var(--border)" }
      }
    >
      {children}
    </button>
  );
}

export default function WhatToWatchPage() {
  const [selection, setSelection] = useState<MoodSelection>(DEFAULT_SELECTION);
  const query = moodSelectionToQuery(selection);
  // The query the current pool was loaded for; loading is "pool is for an older query"
  const [loaded, setLoaded] = useState<{ query: string; data: PoolData } | null>(null);
  const [picks, setPicks] = useState<MoodPick[]>([]);
  const [reload, setReload] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState<Selected | null>(null);
  const [selectedShow, setSelectedShow] = useState<Selected | null>(null);
  const [trailer, setTrailer] = useState<(Selected & { mediaType: "movie" | "tv" }) | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/mood-picks?${query}`);
        if (!res.ok) throw new Error();
        const data: PoolData = await res.json();
        if (cancelled) return;
        setLoaded({ query, data });
        // A reload (after Add/Update) keeps the same cards and just refreshes their flags
        setPicks((current) =>
          reload > 0
            ? current.map((p) => ({ ...p, onWatchlist: candidateKey(p) in data.watchlist }))
            : pick(data, parseMoodSelection(new URLSearchParams(query)))
        );
      } catch {
        if (!cancelled) toast.error("Couldn't load suggestions");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, reload]);

  const isLoading = loaded?.query !== query;
  const data = loaded?.data;

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
        <div
          className="flex rounded-lg overflow-hidden border"
          style={{ borderColor: "var(--border)" }}
          role="group"
          aria-label="Show movies, TV, or both"
        >
          {MEDIA.map((m) => (
            <button
              key={m.value}
              onClick={() => update({ media: m.value })}
              aria-pressed={selection.media === m.value}
              className="px-4 py-1.5 text-sm font-medium cursor-pointer transition-colors"
              style={
                selection.media === m.value
                  ? { backgroundColor: "var(--accent)", color: "white" }
                  : { color: "var(--text-muted)" }
              }
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Pick a mood and we&apos;ll suggest a few titles — your watchlist first, nothing you&apos;ve already seen.
      </p>

      <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Moods">
        {VIBES.map((v) => (
          <Chip
            key={v.value}
            active={selection.vibe === v.value}
            onClick={() => update({ vibe: selection.vibe === v.value ? "any" : v.value })}
          >
            {v.label}
          </Chip>
        ))}
        {TIMES.map((t) => (
          <Chip
            key={t.value}
            active={selection.time === t.value}
            onClick={() => update({ time: selection.time === t.value ? "any" : t.value })}
          >
            {t.label}
          </Chip>
        ))}
        {TOGGLES.map((t) => (
          <Chip key={t.key} active={selection[t.key]} onClick={() => update({ [t.key]: !selection[t.key] })}>
            {t.label}
          </Chip>
        ))}
      </div>

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
          disabled={isLoading || picks.length === 0}
          className="flex items-center gap-1.5 px-4 py-1.5 text-white text-sm rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Shuffle
        </button>
      </div>

      {isLoading && !data ? (
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
                <div className="flex items-center justify-between gap-1 text-xs">
                  {/* Same badge style as the search dropdown's Movie/TV tags */}
                  <span
                    className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                    style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                  >
                    {p.mediaType === "movie" ? "Movie" : "TV"}
                  </span>
                  {p.onWatchlist && (
                    <span className="truncate" style={{ color: "var(--accent)" }}>
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
