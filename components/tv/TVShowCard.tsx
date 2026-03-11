"use client";

import Image from "next/image";
import { useState } from "react";
import { tmdb } from "@/lib/tmdb";
import TVShowDetailModal from "./TVShowDetailModal";

export interface TVSeasonBanner {
  number: number;
  premiereDate: string | null;
  lastAirDate: string | null;
  status: string;
}

interface TVShowCardProps {
  id: number;
  name: string;
  posterPath: string | null;
  firstAirDate?: string;
  overview?: string;
  rating?: number;
  watchingStatus?: string | null;
  seasonBanner?: TVSeasonBanner | null;
  thumbRating?: React.ReactNode;
  children?: React.ReactNode;
}

function formatBannerDate(dateStr: string | null): string {
  if (!dateStr) return "?";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function TVShowCard({
  id,
  name,
  posterPath,
  firstAirDate,
  overview,
  rating,
  watchingStatus,
  seasonBanner,
  thumbRating,
  children,
}: TVShowCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const posterUrl = tmdb.getPosterUrl(posterPath);
  const year = firstAirDate ? new Date(firstAirDate).getFullYear() : null;

  return (
    <>
      <div className="bg-[var(--card-bg)] rounded-lg shadow-sm overflow-hidden border border-[var(--border)] hover:shadow-md transition-shadow">
        <div className="relative w-full aspect-[2/3] bg-[var(--border)] group" style={{ maxHeight: "420px" }}>
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt={name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
              No Image
            </div>
          )}

          {/* Watching badge */}
          {watchingStatus === "WATCHING" && (
            <div
              className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-xs font-semibold text-white"
              style={{ backgroundColor: "var(--accent)", fontSize: "10px" }}
            >
              WATCHING
            </div>
          )}

          {/* Info button on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsDetailOpen(true); }}
            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold leading-none"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.85)" }}
            aria-label={`Info for ${name}`}
          >
            ⓘ
          </button>
        </div>
        {/* Season date banner */}
        {seasonBanner && (
          <div
            className="px-3 py-1.5 text-center"
            style={{ backgroundColor: "var(--border)", borderTop: "1px solid var(--border)" }}
          >
            <p className="text-xs font-medium truncate" style={{ color: "var(--text-muted)" }}>
              S{seasonBanner.number}
              {" · "}
              {formatBannerDate(seasonBanner.premiereDate)}
              {" – "}
              {seasonBanner.status === "Returning Series" || seasonBanner.status === "In Production"
                ? <span style={{ color: "var(--accent)" }}>now</span>
                : formatBannerDate(seasonBanner.lastAirDate)
              }
            </p>
          </div>
        )}

        <div className="p-3 flex flex-col gap-2">
          {thumbRating && <div className="flex justify-end">{thumbRating}</div>}
          {children}
        </div>
      </div>
      <TVShowDetailModal
        tvId={isDetailOpen ? id : null}
        tvName={name}
        posterPath={posterPath}
        overview={overview}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  );
}
