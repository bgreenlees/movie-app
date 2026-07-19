"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import type { TMDBWatchProvider, TMDBMovie } from "@/lib/tmdb";

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
}

interface MovieDetails {
  tagline: string | null;
  overview: string | null;
  poster_path: string | null;
  cast: CastMember[];
  crew: CrewMember[];
}

interface MovieDetailModalProps {
  movieId: number | null;
  movieTitle: string;
  posterPath?: string | null;
  overview?: string;
  onClose: () => void;
}

export default function MovieDetailModal({
  movieId,
  movieTitle,
  posterPath,
  overview,
  onClose,
}: MovieDetailModalProps) {
  const [currentId, setCurrentId] = useState<number | null>(movieId);
  const [currentTitle, setCurrentTitle] = useState<string>(movieTitle);
  const [history, setHistory] = useState<Array<{ id: number; title: string }>>([]);
  const rootPosterRef = useRef<string | null | undefined>(posterPath);
  const rootOverviewRef = useRef<string | undefined>(overview);

  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<{ flatrate: TMDBWatchProvider[]; rent: TMDBWatchProvider[] }>({ flatrate: [], rent: [] });
  const [userServices, setUserServices] = useState<Set<number>>(new Set());

  const [recs, setRecs] = useState<TMDBMovie[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());

  // Reset internal state when the outer prop opens a new modal.
  useEffect(() => {
    if (movieId === null) return;
    setCurrentId(movieId);
    setCurrentTitle(movieTitle);
    setHistory([]);
    rootPosterRef.current = posterPath;
    rootOverviewRef.current = overview;
  }, [movieId, movieTitle, posterPath, overview]);

  // Fetch watchlist ids once per open (not per swap).
  useEffect(() => {
    if (movieId === null) return;
    Promise.all([
      fetch("/api/watchlist?status=WANT_TO_WATCH").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=WATCHED").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=NOT_INTERESTED").then((r) => r.json()).catch(() => ({ entries: [] })),
    ]).then(([want, watched, not]) => {
      const ids = new Set<number>();
      [...(want.entries || []), ...(watched.entries || []), ...(not.entries || [])].forEach((e: any) => {
        if (typeof e.movieId === "number") ids.add(e.movieId);
      });
      setWatchlistIds(ids);
    });
  }, [movieId]);

  // Fetch details + providers + recs whenever the currently viewed movie changes.
  useEffect(() => {
    if (!currentId) return;
    setDetails(null);
    setProviders({ flatrate: [], rent: [] });
    setRecs([]);
    setIsLoading(true);
    setRecsLoading(true);

    Promise.all([
      fetch(`/api/movies/${currentId}/credits`).then((r) => r.json()),
      fetch(`/api/movies/${currentId}/providers`).then((r) => r.json()),
      fetch("/api/user/streaming").then((r) => r.json()),
    ])
      .then(([creditsData, providerData, userData]) => {
        setDetails(creditsData);
        setProviders({ flatrate: providerData.flatrate || [], rent: providerData.rent || [] });
        setUserServices(new Set(userData.streamingServices || []));
      })
      .catch(() => setDetails(null))
      .finally(() => setIsLoading(false));

    fetch(`/api/movies/${currentId}/recommendations`)
      .then((r) => r.json())
      .then((d) => setRecs(d.results || []))
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, [currentId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (movieId) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [movieId, onClose]);

  if (!movieId || !currentId) return null;

  const director = details?.crew.find((c) => c.job === "Director");
  const writers = details?.crew
    .filter((c) => c.department === "Writing" && (c.job === "Screenplay" || c.job === "Writer" || c.job === "Story"))
    .slice(0, 3);
  const cast = details?.cast ?? [];
  const isRootMovie = currentId === movieId;
  const displayPoster = details?.poster_path ?? (isRootMovie ? rootPosterRef.current : null);
  const displayOverview = details?.overview ?? (isRootMovie ? rootOverviewRef.current : undefined);

  const handleSwapTo = (id: number, title: string) => {
    setHistory((prev) => [...prev, { id: currentId, title: currentTitle }]);
    setCurrentId(id);
    setCurrentTitle(title);
  };

  const handleBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      setCurrentId(last.id);
      setCurrentTitle(last.title);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="sticky top-0 flex items-center justify-between px-5 py-3 z-10"
          style={{ backgroundColor: "var(--card-bg)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1 pr-4">
            {history.length > 0 && (
              <button
                onClick={handleBack}
                className="shrink-0 hover:opacity-70 transition-opacity"
                style={{ color: "var(--text-muted)" }}
                aria-label="Back"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="font-bold text-base truncate" style={{ color: "var(--primary)" }}>
              {currentTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: "var(--text-muted)" }}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          {isLoading && (
            <div className="flex items-center justify-center py-16">
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading...</p>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Poster + meta */}
              <div className="flex gap-5">
                {displayPoster && (
                  <div
                    className="shrink-0 rounded-lg overflow-hidden"
                    style={{ width: "120px", aspectRatio: "2/3", backgroundColor: "var(--border)" }}
                  >
                    <Image
                      src={`https://image.tmdb.org/t/p/w300${displayPoster}`}
                      alt={currentTitle}
                      width={120}
                      height={180}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  {details?.tagline && (
                    <p className="text-sm italic mb-3 leading-snug" style={{ color: "var(--text-muted)" }}>
                      &ldquo;{details.tagline}&rdquo;
                    </p>
                  )}
                  {displayOverview && (
                    <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--foreground)" }}>
                      {displayOverview}
                    </p>
                  )}

                  {/* Crew */}
                  <div className="space-y-1">
                    {director && (
                      <div className="flex gap-2 text-sm">
                        <span className="font-semibold shrink-0 w-16" style={{ color: "var(--text-muted)" }}>
                          Director
                        </span>
                        <span style={{ color: "var(--foreground)" }}>{director.name}</span>
                      </div>
                    )}
                    {writers && writers.length > 0 && (
                      <div className="flex gap-2 text-sm">
                        <span className="font-semibold shrink-0 w-16" style={{ color: "var(--text-muted)" }}>
                          {writers.length === 1 ? "Writer" : "Writers"}
                        </span>
                        <span style={{ color: "var(--foreground)" }}>
                          {writers.map((w) => w.name).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Streaming availability */}
              {(providers.flatrate.length > 0 || providers.rent.length > 0) && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                    Where to Watch
                  </h3>
                  {providers.flatrate.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Stream</p>
                      <div className="flex flex-wrap gap-2">
                        {providers.flatrate.map((p) => {
                          const have = userServices.has(p.provider_id);
                          return (
                            <div
                              key={p.provider_id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                              style={{
                                backgroundColor: have ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))" : "transparent",
                                border: `1px solid ${have ? "var(--accent)" : "var(--border)"}`,
                              }}
                              title={p.provider_name}
                            >
                              <div className="relative">
                                <Image
                                  src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                                  alt={p.provider_name}
                                  width={20}
                                  height={20}
                                  className="rounded"
                                />
                                {have && (
                                  <div
                                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                                    style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}
                                  >
                                    ✓
                                  </div>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>
                                {p.provider_name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {providers.rent.length > 0 && (
                    <div>
                      <p className="text-xs mb-1.5" style={{ color: "var(--text-muted)" }}>Rent / Buy</p>
                      <div className="flex flex-wrap gap-2">
                        {providers.rent.map((p) => {
                          const have = userServices.has(p.provider_id);
                          return (
                            <div
                              key={p.provider_id}
                              className="flex items-center gap-1.5 px-2 py-1 rounded-md"
                              style={{
                                backgroundColor: have ? "color-mix(in srgb, var(--accent) 12%, var(--card-bg))" : "transparent",
                                border: `1px solid ${have ? "var(--accent)" : "var(--border)"}`,
                              }}
                              title={p.provider_name}
                            >
                              <div className="relative">
                                <Image
                                  src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                                  alt={p.provider_name}
                                  width={20}
                                  height={20}
                                  className="rounded"
                                />
                                {have && (
                                  <div
                                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white"
                                    style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}
                                  >
                                    ✓
                                  </div>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>
                                {p.provider_name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Cast */}
              {cast.length > 0 && (
                <div className="mt-6">
                  <h3
                    className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Top Cast
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {cast.map((member) => (
                      <div key={member.id} className="text-center">
                        <div
                          className="rounded-full overflow-hidden mx-auto mb-1.5"
                          style={{
                            width: "56px",
                            height: "56px",
                            backgroundColor: "var(--border)",
                          }}
                        >
                          {member.profile_path ? (
                            <Image
                              src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                              alt={member.name}
                              width={56}
                              height={56}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ color: "var(--text-muted)", fontSize: "22px" }}
                            >
                              ◉
                            </div>
                          )}
                        </div>
                        <p className="text-xs font-medium leading-tight" style={{ color: "var(--foreground)" }}>
                          {member.name}
                        </p>
                        <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {member.character}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* More like this */}
              {(recsLoading || recs.length > 0) && (
                <div className="mt-6">
                  <h3
                    className="text-xs font-semibold uppercase tracking-wider mb-3"
                    style={{ color: "var(--text-muted)" }}
                  >
                    More like this
                  </h3>
                  {recsLoading ? (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <div
                          key={i}
                          className="shrink-0 rounded-md animate-pulse"
                          style={{ width: "110px", aspectRatio: "2/3", backgroundColor: "var(--border)" }}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-2">
                      {recs.map((rec) => {
                        const onList = watchlistIds.has(rec.id);
                        return (
                          <button
                            key={rec.id}
                            onClick={() => handleSwapTo(rec.id, rec.title)}
                            className="shrink-0 text-left cursor-pointer group"
                            style={{ width: "110px" }}
                            title={rec.title}
                          >
                            <div
                              className="relative rounded-md overflow-hidden mb-1.5"
                              style={{ width: "110px", aspectRatio: "2/3", backgroundColor: "var(--border)" }}
                            >
                              {rec.poster_path && (
                                <Image
                                  src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                                  alt={rec.title}
                                  width={110}
                                  height={165}
                                  className="object-cover w-full h-full group-hover:opacity-90 transition-opacity"
                                />
                              )}
                              {onList && (
                                <div
                                  className="absolute top-1 right-1 px-1.5 py-0.5 rounded text-white text-[10px] font-semibold leading-none"
                                  style={{ backgroundColor: "var(--accent)" }}
                                  title="On your list"
                                >
                                  ✓ On list
                                </div>
                              )}
                            </div>
                            <p
                              className="text-xs font-medium leading-tight line-clamp-2"
                              style={{ color: "var(--foreground)" }}
                            >
                              {rec.title}
                            </p>
                            {typeof rec.vote_average === "number" && rec.vote_average > 0 && (
                              <p className="text-[11px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                                ★ {rec.vote_average.toFixed(1)}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
