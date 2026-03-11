"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import OnboardingModal from "@/components/movies/OnboardingModal";
import TVShowCard, { type TVSeasonBanner } from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import ThumbRating from "@/components/ui/ThumbRating";
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb";
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

interface TVEntry {
  id: string;
  tvShowId: number;
  status: string;
  platform?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

function DiscoverPageInner() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [mediaType, setMediaType] = useState<"movie" | "tv">("movie");

  // Movie state
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [selectedMovie, setSelectedMovie] = useState<{ id: number; title: string } | null>(null);
  const [watchlistEntries, setWatchlistEntries] = useState<Record<number, WatchlistEntry>>({});
  const [trailerMovie, setTrailerMovie] = useState<{ id: number; title: string } | null>(null);

  // TV state
  const [tvShows, setTVShows] = useState<TMDBTVShow[]>([]);
  const [tvPersonalized, setTVPersonalized] = useState(false);
  const [selectedShow, setSelectedShow] = useState<{ id: number; name: string } | null>(null);
  const [tvEntries, setTVEntries] = useState<Record<number, TVEntry>>({});
  const [seasonBanners, setSeasonBanners] = useState<Record<number, TVSeasonBanner>>({});

  const [isLoading, setIsLoading] = useState(false);
  const [columns, setColumns] = useState(6);
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Watchlist fetches ─────────────────────────────────────────────────────

  const fetchWatchlist = useCallback(async () => {
    try {
      const [wantRes, watchedRes, notRes] = await Promise.all([
        fetch("/api/watchlist?status=WANT_TO_WATCH"),
        fetch("/api/watchlist?status=WATCHED"),
        fetch("/api/watchlist?status=NOT_INTERESTED"),
      ]);
      if (wantRes.ok && watchedRes.ok && notRes.ok) {
        const [wantData, watchedData, notData] = await Promise.all([
          wantRes.json(), watchedRes.json(), notRes.json(),
        ]);
        const entries: Record<number, WatchlistEntry> = {};
        [...(wantData.entries || []), ...(watchedData.entries || []), ...(notData.entries || [])].forEach((e: any) => {
          entries[e.movieId] = { id: e.id, movieId: e.movieId, status: e.status, platform: e.platform, watchType: e.watchType, rating: e.rating, review: e.review };
        });
        setWatchlistEntries(entries);
      }
    } catch {}
  }, []);

  const fetchTVEntries = useCallback(async () => {
    try {
      const res = await fetch("/api/tv/watchlist");
      if (res.ok) {
        const data = await res.json();
        const entries: Record<number, TVEntry> = {};
        (data.entries || []).forEach((e: any) => {
          entries[e.tvShowId] = { id: e.id, tvShowId: e.tvShowId, status: e.status, platform: e.platform, rating: e.rating, review: e.review, currentSeason: e.currentSeason, currentEpisode: e.currentEpisode };
        });
        setTVEntries(entries);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchWatchlist();
    fetchTVEntries();
  }, [fetchWatchlist, fetchTVEntries]);

  useEffect(() => {
    fetch("/api/user").then((r) => r.json()).then((d) => {
      if (!d.hasCompletedOnboarding) setShowOnboarding(true);
    }).catch(() => {});
  }, []);

  // ── Season banner fetch ───────────────────────────────────────────────────

  const fetchSeasonBanners = useCallback(async (shows: TMDBTVShow[]) => {
    const toFetch = shows.slice(0, 24); // cap at 24 to avoid hammering API
    const results = await Promise.allSettled(
      toFetch.map((s) =>
        fetch(`/api/tv/${s.id}/info`).then((r) => r.json()).then((d) => ({
          id: s.id,
          banner: d.latestSeason
            ? { number: d.latestSeason.number, premiereDate: d.latestSeason.premiereDate, lastAirDate: d.lastAirDate, status: d.status }
            : null,
        }))
      )
    );
    const map: Record<number, TVSeasonBanner> = {};
    results.forEach((r) => {
      if (r.status === "fulfilled" && r.value.banner) {
        map[r.value.id] = r.value.banner;
      }
    });
    setSeasonBanners((prev) => ({ ...prev, ...map }));
  }, []);

  // ── Content loading ───────────────────────────────────────────────────────

  useEffect(() => {
    if (mediaType === "movie") {
      if (urlQuery) {
        setIsLoading(true);
        fetch(`/api/movies/search?q=${encodeURIComponent(urlQuery)}`)
          .then((r) => r.json())
          .then((data) => {
            setMovies((data.results || []).sort((a: TMDBMovie, b: TMDBMovie) => b.popularity - a.popularity));
            if (!data.results?.length) toast.error("No movies found");
          })
          .catch(() => toast.error("Search failed"))
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(true);
        fetch("/api/movies/recommended")
          .then((r) => r.json())
          .then((recData) => {
            if (recData.personalized && recData.results.length >= 6) {
              setMovies(recData.results);
              setIsPersonalized(true);
              setIsLoading(false);
              return;
            }
            setIsPersonalized(false);
            return fetch("/api/movies/contextual").then((r) => r.json()).then((ctxData) => {
              setMovies((ctxData.results || []).sort(() => Math.random() - 0.5));
              setShowNudge(true);
            });
          })
          .catch(() => toast.error("Failed to load movies"))
          .finally(() => setIsLoading(false));
      }
    } else {
      // TV mode
      if (urlQuery) {
        setIsLoading(true);
        fetch(`/api/tv/search?q=${encodeURIComponent(urlQuery)}`)
          .then((r) => r.json())
          .then((data) => {
            const results: TMDBTVShow[] = (data.results || [])
              .filter((s: TMDBTVShow) => s.poster_path)
              .sort((a: TMDBTVShow, b: TMDBTVShow) => b.popularity - a.popularity);
            setTVShows(results);
            if (!results.length) toast.error("No TV shows found");
            fetchSeasonBanners(results);
          })
          .catch(() => toast.error("Search failed"))
          .finally(() => setIsLoading(false));
      } else {
        setIsLoading(true);
        fetch("/api/tv/recommended")
          .then((r) => r.json())
          .then((data) => {
            const results: TMDBTVShow[] = data.results || [];
            setTVShows(results);
            setTVPersonalized(data.personalized);
            fetchSeasonBanners(results);
          })
          .catch(() => toast.error("Failed to load TV shows"))
          .finally(() => setIsLoading(false));
      }
    }
  }, [urlQuery, mediaType]);

  useEffect(() => {
    if (!gridRef.current) return;
    const obs = new ResizeObserver(() => {
      if (gridRef.current) {
        const cols = getComputedStyle(gridRef.current).gridTemplateColumns.split(" ").length;
        setColumns(cols);
      }
    });
    obs.observe(gridRef.current);
    return () => obs.disconnect();
  }, [movies, tvShows]);

  // ── Movie handlers ────────────────────────────────────────────────────────

  const handleMovieRating = async (movieId: number, rating: number) => {
    const entry = watchlistEntries[movieId];
    if (entry) {
      setWatchlistEntries((prev) => ({ ...prev, [movieId]: { ...entry, rating: rating || null } }));
      try {
        const res = await fetch(`/api/watchlist/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: rating || null }) });
        if (!res.ok) throw new Error();
      } catch { toast.error("Failed to save rating"); fetchWatchlist(); }
    } else if (rating > 0) {
      try {
        const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movieId, status: "WATCHED", rating }) });
        if (!res.ok) throw new Error();
        fetchWatchlist();
      } catch { toast.error("Failed to save rating"); }
    }
  };

  const handleNotInterested = async (movieId: number) => {
    const entry = watchlistEntries[movieId];
    if (entry?.status === "NOT_INTERESTED") {
      try { await fetch(`/api/watchlist/${entry.id}`, { method: "DELETE" }); fetchWatchlist(); }
      catch { toast.error("Failed to update"); }
    } else if (!entry) {
      try {
        const res = await fetch("/api/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ movieId, status: "NOT_INTERESTED" }) });
        if (!res.ok) throw new Error();
        fetchWatchlist();
      } catch { toast.error("Failed to update"); }
    }
  };

  // ── TV handlers ───────────────────────────────────────────────────────────

  const handleTVRating = async (tvShowId: number, rating: number) => {
    const entry = tvEntries[tvShowId];
    if (entry) {
      setTVEntries((prev) => ({ ...prev, [tvShowId]: { ...entry, rating: rating || null } }));
      try {
        const res = await fetch(`/api/tv/watchlist/${entry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rating: rating || null }) });
        if (!res.ok) throw new Error();
      } catch { toast.error("Failed to save rating"); fetchTVEntries(); }
    } else if (rating > 0) {
      try {
        const res = await fetch("/api/tv/watchlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tvShowId, status: "WATCHED", rating }) });
        if (!res.ok) throw new Error();
        fetchTVEntries();
      } catch { toast.error("Failed to save rating"); }
    }
  };

  // ── Display calculations ──────────────────────────────────────────────────

  const filteredMovies = movies.filter((m) => urlQuery ? true : !watchlistEntries[m.id]);
  const displayMovies = urlQuery
    ? filteredMovies
    : filteredMovies.slice(0, Math.floor(filteredMovies.length / columns) * columns || filteredMovies.length);

  const filteredTV = tvShows.filter((s) => urlQuery ? true : !tvEntries[s.id]);
  const displayTV = urlQuery
    ? filteredTV
    : filteredTV.slice(0, Math.floor(filteredTV.length / columns) * columns || filteredTV.length);

  const heading = urlQuery
    ? `Results for "${urlQuery}"`
    : mediaType === "movie"
      ? isPersonalized ? "Recommended for You" : "Discover"
      : tvPersonalized ? "TV Recommended for You" : "Discover TV Shows";

  const isEmpty = mediaType === "movie" ? displayMovies.length === 0 : displayTV.length === 0;

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Title + toggle */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>
          {heading}
        </h1>

        {/* Movies / TV toggle */}
        <div
          className="flex rounded-lg overflow-hidden shrink-0"
          style={{ border: "1px solid var(--border)" }}
        >
          <button
            onClick={() => setMediaType("movie")}
            className="px-4 py-1.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: mediaType === "movie" ? "var(--accent)" : "transparent",
              color: mediaType === "movie" ? "white" : "var(--foreground)",
            }}
          >
            Movies
          </button>
          <button
            onClick={() => setMediaType("tv")}
            className="px-4 py-1.5 text-sm font-medium transition-all"
            style={{
              backgroundColor: mediaType === "tv" ? "var(--accent)" : "transparent",
              color: mediaType === "tv" ? "white" : "var(--foreground)",
              borderLeft: "1px solid var(--border)",
            }}
          >
            TV Shows
          </button>
        </div>
      </div>

      {/* Nudge (movies only) */}
      {mediaType === "movie" && showNudge && !nudgeDismissed && !urlQuery && (
        <div
          className="flex items-center justify-between gap-4 px-4 py-3 mb-6 rounded-lg border text-sm"
          style={{ borderColor: "var(--accent)", backgroundColor: "color-mix(in srgb, var(--accent) 10%, var(--card-bg))" }}
        >
          <span style={{ color: "var(--foreground)" }}>
            ✨ Get personalised picks —{" "}
            <button onClick={() => setShowOnboarding(true)} className="font-semibold underline" style={{ color: "var(--accent)" }}>
              tell us what you love
            </button>
          </span>
          <button onClick={() => setNudgeDismissed(true)} style={{ color: "var(--text-muted)" }} aria-label="Dismiss">✕</button>
        </div>
      )}

      {isLoading && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      )}

      {/* Movies grid */}
      {!isLoading && mediaType === "movie" && displayMovies.length > 0 && (
        <div ref={gridRef} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {displayMovies.map((movie) => {
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
                thumbRating={
                  <ThumbRating
                    rating={existingEntry?.rating || 0}
                    onChange={(r) => handleMovieRating(movie.id, r)}
                    showLabels={false}
                    notInterested={existingEntry?.status === "NOT_INTERESTED"}
                    onNotInterested={() => handleNotInterested(movie.id)}
                  />
                }
              >
                <button
                  onClick={() => setSelectedMovie({ id: movie.id, title: movie.title })}
                  className="w-full px-3 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {existingEntry ? "Update" : "Add"}
                </button>
              </MovieCard>
            );
          })}
        </div>
      )}

      {/* TV grid */}
      {!isLoading && mediaType === "tv" && displayTV.length > 0 && (
        <div ref={gridRef} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {displayTV.map((show) => {
            const existingEntry = tvEntries[show.id];
            return (
              <TVShowCard
                key={show.id}
                id={show.id}
                name={show.name}
                posterPath={show.poster_path}
                firstAirDate={show.first_air_date}
                overview={show.overview}
                rating={show.vote_average}
                watchingStatus={existingEntry?.status}
                seasonBanner={seasonBanners[show.id] ?? null}
                thumbRating={
                  <ThumbRating
                    rating={existingEntry?.rating || 0}
                    onChange={(r) => handleTVRating(show.id, r)}
                    showLabels={false}
                  />
                }
              >
                <button
                  onClick={() => setSelectedShow({ id: show.id, name: show.name })}
                  className="w-full px-3 py-1.5 text-white rounded-md transition-all duration-200 text-xs cursor-pointer hover:opacity-90 hover:scale-105"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {existingEntry ? "Update" : "Add"}
                </button>
              </TVShowCard>
            );
          })}
        </div>
      )}

      {!isLoading && isEmpty && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            {urlQuery
              ? `No ${mediaType === "tv" ? "TV shows" : "movies"} found. Try a different search term.`
              : `No ${mediaType === "tv" ? "TV shows" : "movies"} available.`}
          </p>
        </div>
      )}

      <TrailerModal
        movieId={trailerMovie?.id ?? null}
        movieTitle={trailerMovie?.title ?? ""}
        onClose={() => setTrailerMovie(null)}
      />

      {showOnboarding && (
        <OnboardingModal
          onClose={() => {
            setShowOnboarding(false);
            setShowNudge(false);
            fetch("/api/movies/recommended").then((r) => r.json()).then((d) => {
              if (d.personalized && d.results.length >= 6) { setMovies(d.results); setIsPersonalized(true); }
            }).catch(() => {});
          }}
        />
      )}

      {selectedMovie && (
        <AddMovieModal
          isOpen={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          movieId={selectedMovie.id}
          movieTitle={selectedMovie.title}
          existingEntry={watchlistEntries[selectedMovie.id]}
          onSuccess={() => { setSelectedMovie(null); fetchWatchlist(); }}
        />
      )}

      {selectedShow && (
        <AddTVModal
          isOpen={!!selectedShow}
          onClose={() => setSelectedShow(null)}
          tvShowId={selectedShow.id}
          tvShowName={selectedShow.name}
          existingEntry={tvEntries[selectedShow.id]}
          onSuccess={() => { setSelectedShow(null); fetchTVEntries(); }}
        />
      )}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6"><p style={{ color: "var(--text-muted)" }}>Loading...</p></div>}>
      <DiscoverPageInner />
    </Suspense>
  );
}
