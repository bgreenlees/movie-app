"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import MovieCard from "@/components/movies/MovieCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import OnboardingModal from "@/components/movies/OnboardingModal";
import TVShowCard, { type TVSeasonBanner } from "@/components/tv/TVShowCard";
import AddTVModal from "@/components/tv/AddTVModal";
import ThumbRating from "@/components/ui/ThumbRating";
import ResultFilters, { type CoStar } from "@/components/ui/ResultFilters";
import { applyResultFilters, genresInResults, intersectIds, readUrlFilters, writeUrlFilters, type UrlFilterState } from "@/lib/resultFilters";
import type { TMDBMovie, TMDBTVShow } from "@/lib/tmdb";
import { DISCOVER_COUNTRIES, countryName, isValidCountry } from "@/lib/countries";
import toast from "react-hot-toast";

interface PersonData {
  id: number;
  name: string;
  profilePath: string | null;
  knownFor: string | null;
  movieCast: TMDBMovie[];
  movieCrewDirected: TMDBMovie[];
  tvCast: TMDBTVShow[];
  tvCrewDirected: TMDBTVShow[];
}

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

async function loadWatchlistEntries(): Promise<Record<number, WatchlistEntry> | null> {
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
      [...(wantData.entries || []), ...(watchedData.entries || []), ...(notData.entries || [])].forEach((e: WatchlistEntry) => {
        entries[e.movieId] = { id: e.id, movieId: e.movieId, status: e.status, platform: e.platform, watchType: e.watchType, rating: e.rating, review: e.review };
      });
      return entries;
    }
  } catch {}
  return null;
}

async function loadTVEntries(): Promise<Record<number, TVEntry> | null> {
  try {
    const res = await fetch("/api/tv/watchlist");
    if (res.ok) {
      const data = await res.json();
      const entries: Record<number, TVEntry> = {};
      (data.entries || []).forEach((e: TVEntry) => {
        entries[e.tvShowId] = { id: e.id, tvShowId: e.tvShowId, status: e.status, platform: e.platform, rating: e.rating, review: e.review, currentSeason: e.currentSeason, currentEpisode: e.currentEpisode };
      });
      return entries;
    }
  } catch {}
  return null;
}

function DiscoverPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const urlQuery = searchParams.get("q") || "";
  const personId = searchParams.get("personId");
  const personNameParam = searchParams.get("name") || "";
  const genreId = searchParams.get("genreId");
  const genreName = searchParams.get("genreName") || "";
  const genreMedia = (searchParams.get("genreMedia") as "movie" | "tv" | null) || null;
  // Country filter applies to browse and genre mode; search and person pages ignore it
  const countryParam = searchParams.get("country");
  const country = isValidCountry(countryParam) && !urlQuery && !personId ? countryParam : null;

  // Movies / TV lives in the URL (?media=tv) so shared filtered links open on the right tab.
  const mediaParam = searchParams.get("media");
  const mediaType: "movie" | "tv" = mediaParam === "tv" || mediaParam === "movie" ? mediaParam : genreMedia || "movie";
  // Sort, genre and co-star filters also live in the URL (see lib/resultFilters.ts).
  const urlFilters = readUrlFilters(searchParams);
  const sort = urlFilters.sort;
  const genreFilter = urlFilters.genreIds;
  const coStarIdList = personId ? urlFilters.coStarIds.filter((id) => String(id) !== personId) : [];
  const [personData, setPersonData] = useState<PersonData | null>(null);

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
  // Set when a search had no exact matches and we fell back to close spellings
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [columns, setColumns] = useState(6);

  // Sort / filter bar (search, person and genre pages)
  const [genreNames, setGenreNames] = useState<{ movie?: Record<number, string>; tv?: Record<number, string> }>({});
  // Name, photo and credits for co-stars in the URL; names arrive with the credits
  // for a shared link, or straight away when picked from the search.
  const [coStarInfo, setCoStarInfo] = useState<
    Record<number, { name?: string; profilePath?: string | null; credits?: { movie: { id: number }[]; tv: { id: number }[] } }>
  >({});
  const coStarFetches = useRef(new Set<number>());
  const gridRef = useRef<HTMLDivElement>(null);

  // ── Watchlist fetches ─────────────────────────────────────────────────────

  // Pure loaders return data instead of setting state, so the mount effect can
  // set state in a promise callback (with a cancellation flag) rather than synchronously.
  const fetchWatchlist = useCallback(async () => {
    const entries = await loadWatchlistEntries();
    if (entries) setWatchlistEntries(entries);
  }, []);

  const fetchTVEntries = useCallback(async () => {
    const entries = await loadTVEntries();
    if (entries) setTVEntries(entries);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadWatchlistEntries().then((entries) => {
      if (!cancelled && entries) setWatchlistEntries(entries);
    });
    loadTVEntries().then((entries) => {
      if (!cancelled && entries) setTVEntries(entries);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Reset state when the load inputs change, during render rather than in the
  // effect (https://react.dev/learn/you-might-not-need-an-effect). Every mode
  // starts a fetch, so isLoading is true until the effect's request settles.
  const loadKey = [urlQuery, mediaType, personId, genreId, genreMedia, country].join("|");
  const [prevLoadKey, setPrevLoadKey] = useState<string | null>(null);
  if (prevLoadKey !== loadKey) {
    setPrevLoadKey(loadKey);
    setSuggestion(null);
    setIsLoading(true);
    if (personId) {
      setPersonData(null);
    } else if (!genreId && country) {
      setIsPersonalized(false);
      setTVPersonalized(false);
      setShowNudge(false);
    }
  }

  useEffect(() => {
    // Ignore responses that arrive after the inputs changed or the page unmounted.
    let cancelled = false;
    const settle = (request: Promise<unknown>, errorMessage: string) => {
      request
        .catch(() => {
          if (!cancelled) toast.error(errorMessage);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    };

    // Person mode
    if (personId) {
      settle(
        fetch(`/api/person/${personId}`)
          .then((r) => r.json())
          .then((data: PersonData) => {
            if (cancelled) return;
            setPersonData(data);
            fetchSeasonBanners([...(data.tvCast || []), ...(data.tvCrewDirected || [])]);
          }),
        "Failed to load person"
      );
      return () => {
        cancelled = true;
      };
    }

    // Genre mode
    if (genreId) {
      const media = genreMedia || "movie";
      const countryQs = country ? `&country=${country}` : "";
      const endpoint =
        media === "movie"
          ? `/api/discover/movie?genreId=${genreId}${countryQs}`
          : `/api/discover/tv?genreId=${genreId}${countryQs}`;
      settle(
        fetch(endpoint)
          .then((r) => r.json())
          .then((data) => {
            if (cancelled) return;
            if (media === "movie") {
              setMovies((data.results || []).sort((a: TMDBMovie, b: TMDBMovie) => b.popularity - a.popularity));
            } else {
              const results: TMDBTVShow[] = (data.results || [])
                .sort((a: TMDBTVShow, b: TMDBTVShow) => b.popularity - a.popularity);
              setTVShows(results);
              fetchSeasonBanners(results);
            }
          }),
        "Failed to load genre results"
      );
      return () => {
        cancelled = true;
      };
    }

    // Country browse mode
    if (country) {
      settle(
        fetch(`/api/discover/${mediaType}?country=${country}`)
          .then((r) => r.json())
          .then((data) => {
            if (cancelled) return;
            if (mediaType === "movie") {
              setMovies(data.results || []);
            } else {
              const results: TMDBTVShow[] = data.results || [];
              setTVShows(results);
              fetchSeasonBanners(results);
            }
          }),
        "Failed to load results"
      );
      return () => {
        cancelled = true;
      };
    }

    if (mediaType === "movie") {
      if (urlQuery) {
        settle(
          fetch(`/api/movies/search?q=${encodeURIComponent(urlQuery)}`)
            .then((r) => r.json())
            .then((data) => {
              if (cancelled) return;
              const results: TMDBMovie[] = data.results || [];
              // Fuzzy results are already ranked by closeness to the query
              if (!data.fuzzy) results.sort((a, b) => b.popularity - a.popularity);
              setMovies(results);
              setSuggestion(data.fuzzy ? data.suggestion ?? null : null);
            }),
          "Search failed"
        );
      } else {
        settle(
          fetch("/api/movies/recommended")
            .then((r) => r.json())
            .then((recData) => {
              if (cancelled) return;
              if (recData.personalized && recData.results.length >= 6) {
                setMovies(recData.results);
                setIsPersonalized(true);
                setIsLoading(false);
                return;
              }
              setIsPersonalized(false);
              return fetch("/api/movies/contextual").then((r) => r.json()).then((ctxData) => {
                if (cancelled) return;
                setMovies((ctxData.results || []).sort(() => Math.random() - 0.5));
                setShowNudge(true);
              });
            }),
          "Failed to load movies"
        );
      }
    } else {
      // TV mode
      if (urlQuery) {
        settle(
          fetch(`/api/tv/search?q=${encodeURIComponent(urlQuery)}`)
            .then((r) => r.json())
            .then((data) => {
              if (cancelled) return;
              const results: TMDBTVShow[] = (data.results || []).filter((s: TMDBTVShow) => s.poster_path);
              // Fuzzy results are already ranked by closeness to the query
              if (!data.fuzzy) results.sort((a, b) => b.popularity - a.popularity);
              setTVShows(results);
              setSuggestion(data.fuzzy ? data.suggestion ?? null : null);
              fetchSeasonBanners(results);
            }),
          "Search failed"
        );
      } else {
        settle(
          fetch("/api/tv/recommended")
            .then((r) => r.json())
            .then((data) => {
              if (cancelled) return;
              const results: TMDBTVShow[] = data.results || [];
              setTVShows(results);
              setTVPersonalized(data.personalized);
              fetchSeasonBanners(results);
            }),
          "Failed to load TV shows"
        );
      }
    }
    return () => {
      cancelled = true;
    };
  }, [urlQuery, mediaType, personId, genreId, genreMedia, country, fetchSeasonBanners]);

  // Genre id → name map for the filter chips, fetched once per media type.
  const haveGenreNames = !!genreNames[mediaType];
  useEffect(() => {
    if (haveGenreNames) return;
    let cancelled = false;
    fetch(`/api/genres?media=${mediaType}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.genres) setGenreNames((prev) => ({ ...prev, [mediaType]: d.genres }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mediaType, haveGenreNames]);

  const updateUrl = (filters: Partial<UrlFilterState>, extra?: (params: URLSearchParams) => void) => {
    const params = writeUrlFilters(new URLSearchParams(searchParams.toString()), filters);
    extra?.(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  // Genre ids differ between movies and TV, so switching tab clears them.
  const setMediaType = (media: "movie" | "tv") => {
    if (media === mediaType) return;
    updateUrl({ genreIds: [] }, (params) => params.set("media", media));
  };

  // Fetch credits for any co-star in the URL we haven't loaded yet.
  const coStarKey = coStarIdList.join(",");
  useEffect(() => {
    for (const id of coStarKey ? coStarKey.split(",").map(Number) : []) {
      if (coStarFetches.current.has(id)) continue;
      coStarFetches.current.add(id);
      fetch(`/api/person/${id}`)
        .then((r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((d: PersonData) => {
          setCoStarInfo((prev) => ({
            ...prev,
            [id]: {
              name: d.name,
              profilePath: d.profilePath,
              credits: {
                movie: [...(d.movieCast || []), ...(d.movieCrewDirected || [])],
                tv: [...(d.tvCast || []), ...(d.tvCrewDirected || [])],
              },
            },
          }));
        })
        .catch(() => {
          coStarFetches.current.delete(id);
          toast.error("Couldn't load a co-star's credits");
        });
    }
  }, [coStarKey]);

  const coStars: CoStar[] = coStarIdList.map((id) => ({
    id,
    name: coStarInfo[id]?.name ?? "Loading…",
    profilePath: coStarInfo[id]?.profilePath ?? null,
  }));

  const handleAddCoStar = (person: CoStar) => {
    if (coStarIdList.includes(person.id)) return;
    setCoStarInfo((prev) => ({ ...prev, [person.id]: { ...prev[person.id], name: person.name, profilePath: person.profilePath } }));
    updateUrl({ coStarIds: [...coStarIdList, person.id] });
  };

  const handleClearFilters = () => updateUrl({ sort: "relevance", genreIds: [], coStarIds: [] });

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

  const handleCountryChange = (code: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (code) params.set("country", code);
    else params.delete("country");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

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

  const isPersonMode = !!personId;
  const isGenreMode = !!genreId;
  const suppressWatchlistFilter = !!urlQuery || isPersonMode || isGenreMode;

  const filteredMovies = movies.filter((m) => (suppressWatchlistFilter ? true : !watchlistEntries[m.id]));
  const displayMovies = suppressWatchlistFilter
    ? filteredMovies
    : filteredMovies.slice(0, Math.floor(filteredMovies.length / columns) * columns || filteredMovies.length);

  const filteredTV = tvShows.filter((s) => (suppressWatchlistFilter ? true : !tvEntries[s.id]));
  const displayTV = suppressWatchlistFilter
    ? filteredTV
    : filteredTV.slice(0, Math.floor(filteredTV.length / columns) * columns || filteredTV.length);

  const heading = isPersonMode
    ? personData?.name || personNameParam || "Person"
    : isGenreMode
      ? `${genreName || "Genre"}`
      : urlQuery
        ? `Results for "${urlQuery}"`
        : country
          ? `${mediaType === "movie" ? "Movies" : "TV Shows"} from ${countryName(country)}`
          : mediaType === "movie"
          ? isPersonalized ? "Recommended for You" : "Discover"
          : tvPersonalized ? "TV Recommended for You" : "Discover TV Shows";

  const personMovieCast = personData?.movieCast ?? [];
  const personMovieDirected = personData?.movieCrewDirected ?? [];
  const personTVCast = personData?.tvCast ?? [];
  const personTVDirected = personData?.tvCrewDirected ?? [];

  const isEmpty = isPersonMode
    ? mediaType === "movie"
      ? personMovieCast.length + personMovieDirected.length === 0
      : personTVCast.length + personTVDirected.length === 0
    : mediaType === "movie"
      ? displayMovies.length === 0
      : displayTV.length === 0;

  // ── Sort / filter ─────────────────────────────────────────────────────────

  const showFilters = isPersonMode || isGenreMode || !!urlQuery;
  // Only co-stars whose credits have loaded narrow the list, so adding one
  // doesn't flash an empty page while its credits are fetched.
  const coStarIds = isPersonMode
    ? intersectIds(coStarIdList.flatMap((id) => { const c = coStarInfo[id]?.credits; return c ? [c[mediaType]] : []; }))
    : null;
  const filterState = { sort, genreIds: genreFilter, onlyIds: coStarIds };
  const applyFilters = <T extends TMDBMovie | TMDBTVShow>(arr: T[]) =>
    showFilters ? applyResultFilters(arr, filterState) : arr;

  const shownMovieCast = applyFilters(personMovieCast);
  const shownMovieDirected = applyFilters(personMovieDirected);
  const shownTVCast = applyFilters(personTVCast);
  const shownTVDirected = applyFilters(personTVDirected);
  const shownMovies = applyFilters(displayMovies);
  const shownTV = applyFilters(displayTV);

  const unfilteredResults: Array<TMDBMovie | TMDBTVShow> = isPersonMode
    ? mediaType === "movie"
      ? [...personMovieCast, ...personMovieDirected]
      : [...personTVCast, ...personTVDirected]
    : mediaType === "movie"
      ? displayMovies
      : displayTV;
  const shownCount = isPersonMode
    ? mediaType === "movie"
      ? shownMovieCast.length + shownMovieDirected.length
      : shownTVCast.length + shownTVDirected.length
    : mediaType === "movie"
      ? shownMovies.length
      : shownTV.length;
  const availableGenres = genresInResults(unfilteredResults, genreNames[mediaType] ?? {});
  const isFilteredEmpty = !isEmpty && shownCount === 0;

  const renderMovieGrid = (arr: TMDBMovie[], key: string) => (
    <div key={key} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
      {arr.map((movie) => {
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
              className="w-full px-3 py-2.5 text-white rounded-md transition-all duration-200 text-sm cursor-pointer hover:opacity-90 hover:scale-105"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {existingEntry ? "Update" : "Add"}
            </button>
          </MovieCard>
        );
      })}
    </div>
  );

  const renderTVGrid = (arr: TMDBTVShow[], key: string) => (
    <div key={key} className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
      {arr.map((show) => {
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
              className="w-full px-3 py-2.5 text-white rounded-md transition-all duration-200 text-sm cursor-pointer hover:opacity-90 hover:scale-105"
              style={{ backgroundColor: "var(--accent)" }}
            >
              {existingEntry ? "Update" : "Add"}
            </button>
          </TVShowCard>
        );
      })}
    </div>
  );

  const mediaToggle = (
    <div
      className="flex rounded-lg overflow-hidden shrink-0"
      style={{ border: "1px solid var(--border)" }}
    >
      <button
        onClick={() => setMediaType("movie")}
        className="px-4 py-2.5 text-sm font-medium transition-all"
        style={{
          backgroundColor: mediaType === "movie" ? "var(--accent)" : "transparent",
          color: mediaType === "movie" ? "white" : "var(--foreground)",
        }}
      >
        Movies
      </button>
      <button
        onClick={() => setMediaType("tv")}
        className="px-4 py-2.5 text-sm font-medium transition-all"
        style={{
          backgroundColor: mediaType === "tv" ? "var(--accent)" : "transparent",
          color: mediaType === "tv" ? "white" : "var(--foreground)",
          borderLeft: "1px solid var(--border)",
        }}
      >
        TV Shows
      </button>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Title + toggle */}
      <div className={`flex items-center justify-between gap-3 flex-wrap ${showFilters ? "mb-4" : "mb-6"}`}>
        <div className="flex items-center gap-3 min-w-0">
          {isPersonMode && personData?.profilePath && (
            <div
              className="shrink-0 rounded-full overflow-hidden"
              style={{ width: 56, height: 56, backgroundColor: "var(--border)" }}
            >
              <Image
                src={`https://image.tmdb.org/t/p/w185${personData.profilePath}`}
                alt={personData.name}
                width={56}
                height={56}
                className="object-cover w-full h-full"
              />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: "var(--primary)" }}>
              {heading}
            </h1>
            {isPersonMode && personData?.knownFor && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {personData.knownFor === "Directing" ? "Director" : personData.knownFor === "Acting" ? "Actor" : personData.knownFor}
              </p>
            )}
            {isGenreMode && (
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                {genreMedia === "tv" ? "TV shows" : "Movies"}
                {country && ` from ${countryName(country)}`}
              </p>
            )}
            {suggestion && urlQuery && !isPersonMode && !isGenreMode && !isLoading && (
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                No exact matches. Did you mean{" "}
                <Link
                  href={`/search?q=${encodeURIComponent(suggestion)}`}
                  className="font-semibold underline"
                  style={{ color: "var(--accent)" }}
                >
                  {suggestion}
                </Link>
                ?
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {/* Country filter (browse and genre mode only) */}
          {!urlQuery && !isPersonMode && (
            <select
              value={country ?? ""}
              onChange={(e) => handleCountryChange(e.target.value)}
              aria-label="Filter by country"
              className="px-3 py-2.5 text-sm font-medium rounded-lg cursor-pointer"
              style={{
                border: "1px solid var(--border)",
                backgroundColor: country ? "var(--accent)" : "var(--card-bg)",
                color: country ? "white" : "var(--foreground)",
              }}
            >
              {[{ code: "", name: "All countries" }, ...DISCOVER_COUNTRIES].map((c) => (
                <option
                  key={c.code}
                  value={c.code}
                  style={{ backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
                >
                  {c.name}
                </option>
              ))}
            </select>
          )}

          {!showFilters && mediaToggle}
        </div>
      </div>

      {/* Nudge (movies only) */}
      {mediaType === "movie" && showNudge && !nudgeDismissed && !urlQuery && !isPersonMode && !isGenreMode && !country && (
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

      {showFilters && (
        <ResultFilters
          leading={mediaToggle}
          disabled={isLoading || isEmpty}
          sort={sort}
          onSortChange={(next) => updateUrl({ sort: next })}
          genres={availableGenres}
          selectedGenreIds={genreFilter}
          onToggleGenre={(id) =>
            updateUrl({ genreIds: genreFilter.includes(id) ? genreFilter.filter((g) => g !== id) : [...genreFilter, id] })
          }
          {...(isPersonMode
            ? {
                coStars,
                excludePersonId: Number(personId),
                onAddCoStar: handleAddCoStar,
                onRemoveCoStar: (id: number) => updateUrl({ coStarIds: coStarIdList.filter((c) => c !== id) }),
              }
            : {})}
          shownCount={shownCount}
          totalCount={unfilteredResults.length}
          onClear={handleClearFilters}
        />
      )}

      {isLoading && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))" }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden" style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}>
              <div className="w-full aspect-[2/3] animate-pulse" style={{ backgroundColor: "var(--border)" }} />
              <div className="p-3 flex flex-col gap-2">
                <div className="h-8 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
                <div className="h-7 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Person mode: sections */}
      {!isLoading && isPersonMode && mediaType === "movie" && (
        <div ref={gridRef} className="space-y-8">
          {shownMovieCast.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                Movies with {personData?.name || personNameParam}
              </h2>
              {renderMovieGrid(shownMovieCast, "movie-cast")}
            </div>
          )}
          {shownMovieDirected.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                Movies directed by {personData?.name || personNameParam}
              </h2>
              {renderMovieGrid(shownMovieDirected, "movie-directed")}
            </div>
          )}
        </div>
      )}

      {!isLoading && isPersonMode && mediaType === "tv" && (
        <div ref={gridRef} className="space-y-8">
          {shownTVCast.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                TV shows with {personData?.name || personNameParam}
              </h2>
              {renderTVGrid(shownTVCast, "tv-cast")}
            </div>
          )}
          {shownTVDirected.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--foreground)" }}>
                TV shows directed by {personData?.name || personNameParam}
              </h2>
              {renderTVGrid(shownTVDirected, "tv-directed")}
            </div>
          )}
        </div>
      )}

      {/* Movies grid (normal / genre / query mode) */}
      {!isLoading && !isPersonMode && mediaType === "movie" && shownMovies.length > 0 && (
        <div ref={gridRef}>{renderMovieGrid(shownMovies, "movies")}</div>
      )}

      {/* TV grid (normal / genre / query mode) */}
      {!isLoading && !isPersonMode && mediaType === "tv" && shownTV.length > 0 && (
        <div ref={gridRef}>{renderTVGrid(shownTV, "tvshows")}</div>
      )}

      {!isLoading && isFilteredEmpty && (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            {coStars.length > 0 && coStarIds
              ? `No ${mediaType === "tv" ? "TV shows" : "movies"} with ${personData?.name || personNameParam} and ${coStars.map((c) => c.name).join(" and ")}${genreFilter.length ? " in the selected genres" : ""}`
              : `Nothing matches these filters`}
          </p>
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-sm font-semibold underline cursor-pointer"
            style={{ color: "var(--accent)" }}
          >
            Clear filters
          </button>
        </div>
      )}

      {!isLoading && isEmpty && (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" style={{ color: "var(--text-muted)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-base" style={{ color: "var(--text-muted)" }}>
            {isPersonMode
              ? `No ${mediaType === "tv" ? "TV credits" : "movie credits"} for ${personData?.name || personNameParam}`
              : isGenreMode
                ? `No ${mediaType === "tv" ? "TV shows" : "movies"} found for ${genreName}${country ? ` from ${countryName(country)}` : ""}`
                : urlQuery
                  ? `No ${mediaType === "tv" ? "TV shows" : "movies"} found for "${urlQuery}"`
                  : country
                    ? `No ${mediaType === "tv" ? "TV shows" : "movies"} found from ${countryName(country)}`
                    : `No ${mediaType === "tv" ? "TV shows" : "movies"} available.`}
          </p>
          {urlQuery && !isPersonMode && !isGenreMode && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Check the spelling, try fewer words, or switch to {mediaType === "tv" ? "Movies" : "TV Shows"}
            </p>
          )}
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
              if (!country && d.personalized && d.results.length >= 6) { setMovies(d.results); setIsPersonalized(true); }
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
