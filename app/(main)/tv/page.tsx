"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PosterCard, { POSTER_GRID } from "@/components/ui/PosterCard";
import { isOnList, seasonMeta, yearMeta, type SeasonBanner as TVSeasonBanner } from "@/lib/posterCard";
import TrailerModal from "@/components/movies/TrailerModal";
import AddTVModal from "@/components/tv/AddTVModal";
import type { TMDBTVShow } from "@/lib/tmdb";
import toast from "react-hot-toast";

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

async function loadTVEntries(): Promise<Record<number, TVEntry> | null> {
  try {
    const res = await fetch("/api/tv/watchlist");
    if (res.ok) {
      const data = await res.json();
      const entries: Record<number, TVEntry> = {};
      (data.entries || []).forEach((entry: TVEntry) => {
        entries[entry.tvShowId] = {
          id: entry.id,
          tvShowId: entry.tvShowId,
          status: entry.status,
          platform: entry.platform,
          rating: entry.rating,
          review: entry.review,
          currentSeason: entry.currentSeason,
          currentEpisode: entry.currentEpisode,
        };
      });
      return entries;
    }
  } catch {}
  return null;
}

function TVDiscoverInner() {
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [shows, setShows] = useState<TMDBTVShow[]>([]);
  const [isPersonalized, setIsPersonalized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedShow, setSelectedShow] = useState<{ id: number; name: string } | null>(null);
  const [trailer, setTrailer] = useState<{ id: number; title: string } | null>(null);
  const [tvEntries, setTVEntries] = useState<Record<number, TVEntry>>({});
  const [seasonBanners, setSeasonBanners] = useState<Record<number, TVSeasonBanner>>({});
  const [columns, setColumns] = useState(6);
  const gridRef = useRef<HTMLDivElement>(null);

  const fetchSeasonBanners = useCallback(async (shows: TMDBTVShow[]) => {
    const toFetch = shows.slice(0, 24);
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

  // Refresh after a mutation (called from event handlers).
  const fetchTVEntries = useCallback(async () => {
    const entries = await loadTVEntries();
    if (entries) setTVEntries(entries);
  }, []);

  // On mount, set state from the promise callback, not synchronously in the effect.
  useEffect(() => {
    let cancelled = false;
    loadTVEntries().then((entries) => {
      if (!cancelled && entries) setTVEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (urlQuery) {
      const fetchResults = async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`/api/tv/search?q=${encodeURIComponent(urlQuery)}`);
          if (res.ok) {
            const data = await res.json();
            const results: TMDBTVShow[] = (data.results || [])
              .filter((s: TMDBTVShow) => s.poster_path)
              .sort((a: TMDBTVShow, b: TMDBTVShow) => b.popularity - a.popularity);
            setShows(results);
            if (!results.length) toast.error("No TV shows found");
            fetchSeasonBanners(results);
          } else {
            toast.error("Search failed");
          }
        } catch {
          toast.error("Search failed");
        } finally {
          setIsLoading(false);
        }
      };
      fetchResults();
    } else {
      const loadShows = async () => {
        setIsLoading(true);
        try {
          const recRes = await fetch("/api/tv/recommended");
          if (recRes.ok) {
            const recData = await recRes.json();
            const results: TMDBTVShow[] = recData.results || [];
            setShows(results);
            setIsPersonalized(recData.personalized);
            fetchSeasonBanners(results);
          } else {
            toast.error("Failed to load TV shows");
          }
        } catch {
          toast.error("Failed to load TV shows");
        } finally {
          setIsLoading(false);
        }
      };
      loadShows();
    }
  }, [urlQuery, fetchSeasonBanners]);

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
  }, [shows]);

  const filteredShows = shows.filter((show) =>
    urlQuery ? true : !tvEntries[show.id]
  );
  const displayShows = urlQuery
    ? filteredShows
    : filteredShows.slice(0, Math.floor(filteredShows.length / columns) * columns || filteredShows.length);

  return (
    <div className="max-w-7xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6" style={{ color: "var(--primary)" }}>
        {urlQuery ? `TV Results for "${urlQuery}"` : isPersonalized ? "TV Recommended for You" : "Discover TV Shows"}
      </h1>

      {isLoading && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      )}

      {!isLoading && displayShows.length > 0 && (
        <div ref={gridRef} className={POSTER_GRID}>
          {displayShows.map((show) => {
            const existingEntry = tvEntries[show.id];
            const banner = seasonBanners[show.id];
            return (
              <PosterCard
                key={show.id}
                id={show.id}
                mediaType="tv"
                title={show.name}
                posterPath={show.poster_path}
                overview={show.overview}
                meta={banner ? seasonMeta(banner) : yearMeta(show.first_air_date, "tv")}
                onList={isOnList(existingEntry?.status)}
                onAdd={() => setSelectedShow({ id: show.id, name: show.name })}
                onTrailer={() => setTrailer({ id: show.id, title: show.name })}
              />
            );
          })}
        </div>
      )}

      {!isLoading && displayShows.length === 0 && (
        <div className="text-center py-12">
          <p style={{ color: "var(--text-muted)" }}>
            {urlQuery ? "No TV shows found. Try a different search term." : "No TV shows available."}
          </p>
        </div>
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
          tvShowId={selectedShow.id}
          tvShowName={selectedShow.name}
          existingEntry={tvEntries[selectedShow.id]}
          onSuccess={() => {
            setSelectedShow(null);
            fetchTVEntries();
          }}
        />
      )}
    </div>
  );
}

export default function TVDiscoverPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto p-6"><p style={{ color: "var(--text-muted)" }}>Loading...</p></div>}>
      <TVDiscoverInner />
    </Suspense>
  );
}
