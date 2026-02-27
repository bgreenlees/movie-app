"use client";

import Image from "next/image";
import { useState } from "react";
import { tmdb } from "@/lib/tmdb";
import MovieDetailModal from "./MovieDetailModal";

interface MovieCardProps {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate?: string;
  overview?: string;
  rating?: number;
  onPlayTrailer?: (id: number) => void;
  thumbRating?: React.ReactNode;
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
  thumbRating,
  children,
}: MovieCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const posterUrl = tmdb.getPosterUrl(posterPath);
  const year = releaseDate ? new Date(releaseDate).getFullYear() : null;

  return (
    <>
      <div className="bg-[var(--card-bg)] rounded-lg shadow-sm overflow-hidden border border-[var(--border)] hover:shadow-md transition-shadow">
        <div className="relative w-full aspect-[2/3] bg-[var(--border)] group" style={{ maxHeight: "420px" }}>
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
          {/* Info button — appears on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); setIsDetailOpen(true); }}
            className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold leading-none"
            style={{ backgroundColor: "rgba(0,0,0,0.55)", color: "rgba(255,255,255,0.85)" }}
            aria-label={`Info for ${title}`}
          >
            ⓘ
          </button>
          {onPlayTrailer && (
            <button
              onClick={() => onPlayTrailer(id)}
              className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 py-1.5 bg-black/40 group-hover:bg-black/65 transition-all cursor-pointer"
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
        <div className="p-3 flex flex-col gap-2">
          {thumbRating && <div className="flex justify-end">{thumbRating}</div>}
          {children}
        </div>
      </div>
      <MovieDetailModal
        movieId={isDetailOpen ? id : null}
        movieTitle={title}
        posterPath={posterPath}
        overview={overview}
        onClose={() => setIsDetailOpen(false)}
      />
    </>
  );
}
