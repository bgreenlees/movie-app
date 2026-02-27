"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import type { TMDBWatchProvider } from "@/lib/tmdb";

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
  const [details, setDetails] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [providers, setProviders] = useState<{ flatrate: TMDBWatchProvider[]; rent: TMDBWatchProvider[] }>({ flatrate: [], rent: [] });
  const [userServices, setUserServices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!movieId) return;
    setDetails(null);
    setProviders({ flatrate: [], rent: [] });
    setIsLoading(true);

    Promise.all([
      fetch(`/api/movies/${movieId}/credits`).then((r) => r.json()),
      fetch(`/api/movies/${movieId}/providers`).then((r) => r.json()),
      fetch("/api/user/streaming").then((r) => r.json()),
    ])
      .then(([creditsData, providerData, userData]) => {
        setDetails(creditsData);
        setProviders({ flatrate: providerData.flatrate || [], rent: providerData.rent || [] });
        setUserServices(new Set(userData.streamingServices || []));
      })
      .catch(() => setDetails(null))
      .finally(() => setIsLoading(false));
  }, [movieId]);

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

  if (!movieId) return null;

  const director = details?.crew.find((c) => c.job === "Director");
  const writers = details?.crew
    .filter((c) => c.department === "Writing" && (c.job === "Screenplay" || c.job === "Writer" || c.job === "Story"))
    .slice(0, 3);
  const cast = details?.cast ?? [];
  const displayPoster = details?.poster_path ?? posterPath;
  const displayOverview = details?.overview ?? overview;

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
          <h2 className="font-bold text-base truncate pr-4" style={{ color: "var(--primary)" }}>
            {movieTitle}
          </h2>
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
                      alt={movieTitle}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
