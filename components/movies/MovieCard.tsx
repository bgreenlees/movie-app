"use client";

import Image from "next/image";
import { tmdb } from "@/lib/tmdb";

interface MovieCardProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string;
  overview?: string;
  rating?: number;
  onPlayTrailer?: (id: number) => void;
  children?: React.ReactNode;
}

export default function MovieCard({
  id,
  title,
  posterPath,
  releaseDate,
  overview,
  rating,
  onPlayTrailer,
  children,
}: MovieCardProps) {
  const posterUrl = tmdb.getPosterUrl(posterPath);
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

  return (
    <div className="bg-[var(--card-bg)] rounded-lg shadow-sm overflow-hidden border border-[var(--border)] hover:shadow-md transition-shadow">
      <div className="relative w-full aspect-[2/3] bg-[var(--border)] group" style={{ maxHeight: "300px" }}>
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
            No Image
          </div>
        )}
        {rating !== undefined && rating > 0 && (
          <div className="absolute top-2 right-2 bg-black/75 text-white px-2 py-1 rounded text-sm font-semibold">
            ⭐ {rating.toFixed(1)}
          </div>
        )}
        {onPlayTrailer && (
          <button
            onClick={() => onPlayTrailer(id)}
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1.5 bg-black/40 group-hover:bg-black/65 transition-all"
            aria-label={`Play trailer for ${title}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white/80 group-hover:text-white transition-colors">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span className="text-xs text-white/80 group-hover:text-white transition-colors font-medium tracking-wide">
              Trailer
            </span>
          </button>
        )}
      </div>
      <div className="p-3 flex flex-col">
        <h3 className="font-semibold text-base mb-1 line-clamp-2 h-12" style={{ color: "var(--primary)" }}>
          {title}
        </h3>
        <p className="text-xs mb-2 h-4" style={{ color: "var(--text-muted)" }}>
          {year || "\u00A0"}
        </p>
        {children}
      </div>
    </div>
  );
}
