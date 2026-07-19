"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import type { TMDBWatchProvider, TMDBEpisode, TMDBSeason, TMDBNextEpisode, TMDBTVShow } from "@/lib/tmdb";

interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

interface TVDetails {
  tagline: string | null;
  overview: string | null;
  poster_path: string | null;
  status: string;
  first_air_date: string;
  last_air_date: string | null;
  number_of_seasons: number;
  number_of_episodes: number;
  next_episode_to_air: TMDBNextEpisode | null;
  seasons: TMDBSeason[];
  networks: Array<{ id: number; name: string; logo_path: string | null }>;
  cast: CastMember[];
}

interface TVShowDetailModalProps {
  tvId: number | null;
  tvName: string;
  posterPath?: string | null;
  overview?: string;
  onClose: () => void;
}

function formatAirDate(dateStr: string | null) {
  if (!dateStr) return "TBA";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function TVShowDetailModal({
  tvId,
  tvName,
  posterPath,
  overview,
  onClose,
}: TVShowDetailModalProps) {
  const [currentId, setCurrentId] = useState<number | null>(tvId);
  const [currentName, setCurrentName] = useState<string>(tvName);
  const [history, setHistory] = useState<Array<{ id: number; name: string }>>([]);
  const rootPosterRef = useRef<string | null | undefined>(posterPath);
  const rootOverviewRef = useRef<string | undefined>(overview);

  const [details, setDetails] = useState<TVDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<{ flatrate: TMDBWatchProvider[]; rent: TMDBWatchProvider[] }>({ flatrate: [], rent: [] });
  const [userServices, setUserServices] = useState<Set<number>>(new Set());
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
  const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, TMDBEpisode[]>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<Set<number>>(new Set());

  const [recs, setRecs] = useState<TMDBTVShow[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [watchlistIds, setWatchlistIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (tvId === null) return;
    setCurrentId(tvId);
    setCurrentName(tvName);
    setHistory([]);
    rootPosterRef.current = posterPath;
    rootOverviewRef.current = overview;
  }, [tvId, tvName, posterPath, overview]);

  useEffect(() => {
    if (tvId === null) return;
    fetch("/api/tv/watchlist")
      .then((r) => r.json())
      .then((d) => {
        const ids = new Set<number>();
        (d.entries || []).forEach((e: any) => {
          if (typeof e.tvShowId === "number") ids.add(e.tvShowId);
        });
        setWatchlistIds(ids);
      })
      .catch(() => {});
  }, [tvId]);

  useEffect(() => {
    if (!currentId) return;
    setDetails(null);
    setProviders({ flatrate: [], rent: [] });
    setExpandedSeason(null);
    setSeasonEpisodes({});
    setRecs([]);
    setIsLoading(true);
    setRecsLoading(true);

    Promise.all([
      fetch(`/api/tv/${currentId}/credits`).then((r) => r.json()),
      fetch(`/api/tv/${currentId}/providers`).then((r) => r.json()),
      fetch("/api/user/streaming").then((r) => r.json()),
    ])
      .then(([creditsData, providerData, userData]) => {
        setDetails(creditsData);
        setProviders({ flatrate: providerData.flatrate || [], rent: providerData.rent || [] });
        setUserServices(new Set(userData.streamingServices || []));
      })
      .catch(() => setDetails(null))
      .finally(() => setIsLoading(false));

    fetch(`/api/tv/${currentId}/recommendations`)
      .then((r) => r.json())
      .then((d) => setRecs(d.results || []))
      .catch(() => setRecs([]))
      .finally(() => setRecsLoading(false));
  }, [currentId]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (tvId) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [tvId, onClose]);

  const toggleSeason = async (seasonNumber: number) => {
    if (expandedSeason === seasonNumber) {
      setExpandedSeason(null);
      return;
    }
    setExpandedSeason(seasonNumber);
    if (!seasonEpisodes[seasonNumber]) {
      setLoadingSeasons((prev) => new Set(prev).add(seasonNumber));
      try {
        const res = await fetch(`/api/tv/${currentId}/season/${seasonNumber}`);
        const data = await res.json();
        setSeasonEpisodes((prev) => ({ ...prev, [seasonNumber]: data.episodes || [] }));
      } finally {
        setLoadingSeasons((prev) => {
          const next = new Set(prev);
          next.delete(seasonNumber);
          return next;
        });
      }
    }
  };

  const handleSwapTo = (id: number, name: string) => {
    setHistory((prev) => [...prev, { id: currentId!, name: currentName }]);
    setCurrentId(id);
    setCurrentName(name);
    setExpandedSeason(null);
    setSeasonEpisodes({});
  };

  const handleBack = () => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      const last = prev[prev.length - 1];
      setCurrentId(last.id);
      setCurrentName(last.name);
      setExpandedSeason(null);
      setSeasonEpisodes({});
      return next;
    });
  };

  if (!tvId || !currentId) return null;

  const isRootShow = currentId === tvId;
  const displayPoster = details?.poster_path ?? (isRootShow ? rootPosterRef.current : null);
  const displayOverview = details?.overview ?? (isRootShow ? rootOverviewRef.current : undefined);
  const mainSeasons = details?.seasons.filter((s) => s.season_number > 0) ?? [];
  const nextEp = details?.next_episode_to_air;
  const daysAway = nextEp ? daysUntil(nextEp.air_date) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
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
              {currentName}
            </h2>
          </div>
          <button onClick={onClose} className="shrink-0 hover:opacity-70 transition-opacity" style={{ color: "var(--text-muted)" }} aria-label="Close">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

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
                  <div className="shrink-0 rounded-lg overflow-hidden" style={{ width: "120px", aspectRatio: "2/3", backgroundColor: "var(--border)" }}>
                    <Image
                      src={`https://image.tmdb.org/t/p/w300${displayPoster}`}
                      alt={currentName}
                      width={120}
                      height={180}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  {details?.tagline && (
                    <p className="text-sm italic mb-2 leading-snug" style={{ color: "var(--text-muted)" }}>
                      &ldquo;{details.tagline}&rdquo;
                    </p>
                  )}
                  {displayOverview && (
                    <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--foreground)" }}>
                      {displayOverview}
                    </p>
                  )}
                  {details && (
                    <div className="space-y-1 text-sm">
                      <div className="flex gap-2">
                        <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Status</span>
                        <span style={{ color: "var(--foreground)" }}>{details.status}</span>
                      </div>
                      <div className="flex gap-2">
                        <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Seasons</span>
                        <span style={{ color: "var(--foreground)" }}>{details.number_of_seasons} seasons · {details.number_of_episodes} episodes</span>
                      </div>
                      {details.networks.length > 0 && (
                        <div className="flex gap-2">
                          <span className="font-semibold shrink-0 w-20" style={{ color: "var(--text-muted)" }}>Network</span>
                          <span style={{ color: "var(--foreground)" }}>{details.networks.map((n) => n.name).join(", ")}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Next episode banner */}
              {nextEp && (
                <div
                  className="mt-4 px-4 py-3 rounded-lg"
                  style={{ backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))", border: "1px solid var(--accent)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--accent)" }}>
                    Next Episode
                  </p>
                  <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                    S{String(nextEp.season_number).padStart(2, "0")}E{String(nextEp.episode_number).padStart(2, "0")} — {nextEp.name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {formatAirDate(nextEp.air_date)}
                    {daysAway !== null && daysAway > 0 && ` · in ${daysAway} day${daysAway === 1 ? "" : "s"}`}
                    {daysAway !== null && daysAway === 0 && " · Today!"}
                    {daysAway !== null && daysAway < 0 && " · Aired"}
                  </p>
                </div>
              )}

              {/* Streaming */}
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
                                <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                                {have && (
                                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: "var(--accent)", fontSize: "8px" }}>✓</div>
                                )}
                              </div>
                              <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>{p.provider_name}</span>
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
                              <Image src={`https://image.tmdb.org/t/p/w92${p.logo_path}`} alt={p.provider_name} width={20} height={20} className="rounded" />
                              <span className="text-xs" style={{ color: have ? "var(--accent)" : "var(--foreground)", fontWeight: have ? 600 : 400 }}>{p.provider_name}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Seasons / Episodes accordion */}
              {mainSeasons.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                    Seasons & Episodes
                  </h3>
                  <div className="space-y-2">
                    {mainSeasons.map((season) => (
                      <div key={season.season_number} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                        <button
                          onClick={() => toggleSeason(season.season_number)}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[var(--hover-bg)] transition-colors"
                        >
                          <div>
                            <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                              {season.name}
                            </span>
                            <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                              {season.episode_count} episodes
                              {season.air_date && ` · ${new Date(season.air_date).getFullYear()}`}
                            </span>
                          </div>
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4 transition-transform shrink-0"
                            style={{
                              color: "var(--text-muted)",
                              transform: expandedSeason === season.season_number ? "rotate(180deg)" : "rotate(0deg)",
                            }}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>

                        {expandedSeason === season.season_number && (
                          <div style={{ borderTop: "1px solid var(--border)" }}>
                            {loadingSeasons.has(season.season_number) ? (
                              <div className="px-4 py-3">
                                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Loading episodes...</p>
                              </div>
                            ) : (
                              <div className="divide-y" style={{ borderColor: "var(--border)" }}>
                                {(seasonEpisodes[season.season_number] || []).map((ep) => {
                                  const aired = ep.air_date ? new Date(ep.air_date) <= new Date() : false;
                                  return (
                                    <div key={ep.episode_number} className="px-4 py-2.5 flex items-start gap-3">
                                      <span className="text-xs font-mono shrink-0 mt-0.5 w-8" style={{ color: "var(--text-muted)" }}>
                                        E{String(ep.episode_number).padStart(2, "0")}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate" style={{ color: aired ? "var(--foreground)" : "var(--text-muted)" }}>
                                          {ep.name}
                                        </p>
                                        {ep.air_date && (
                                          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                            {formatAirDate(ep.air_date)}
                                            {!aired && (
                                              <span className="ml-1.5 px-1 py-0.5 rounded text-white" style={{ backgroundColor: "var(--accent)", fontSize: "9px" }}>
                                                UPCOMING
                                              </span>
                                            )}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cast */}
              {details && details.cast.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
                    Top Cast
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {details.cast.map((member) => (
                      <div key={member.id} className="text-center">
                        <div className="rounded-full overflow-hidden mx-auto mb-1.5" style={{ width: "56px", height: "56px", backgroundColor: "var(--border)" }}>
                          {member.profile_path ? (
                            <Image src={`https://image.tmdb.org/t/p/w185${member.profile_path}`} alt={member.name} width={56} height={56} className="object-cover w-full h-full" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ color: "var(--text-muted)", fontSize: "22px" }}>◉</div>
                          )}
                        </div>
                        <p className="text-xs font-medium leading-tight" style={{ color: "var(--foreground)" }}>{member.name}</p>
                        <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>{member.character}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* More like this */}
              {(recsLoading || recs.length > 0) && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
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
                            onClick={() => handleSwapTo(rec.id, rec.name)}
                            className="shrink-0 text-left cursor-pointer group"
                            style={{ width: "110px" }}
                            title={rec.name}
                          >
                            <div
                              className="relative rounded-md overflow-hidden mb-1.5"
                              style={{ width: "110px", aspectRatio: "2/3", backgroundColor: "var(--border)" }}
                            >
                              {rec.poster_path && (
                                <Image
                                  src={`https://image.tmdb.org/t/p/w300${rec.poster_path}`}
                                  alt={rec.name}
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
                              {rec.name}
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
