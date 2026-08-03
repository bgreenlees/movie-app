"use client";

import { useEffect, useState } from "react";

interface TrailerModalProps {
  movieId: number | null;
  movieTitle: string;
  mediaType?: "movie" | "tv";
  onClose: () => void;
}

export default function TrailerModal({ movieId, movieTitle, mediaType = "movie", onClose }: TrailerModalProps) {
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!movieId) return;

    setTrailerKey(null);
    setNotFound(false);
    setIsLoading(true);

    fetch(`/api/${mediaType === "tv" ? "tv" : "movies"}/${movieId}/trailer`)
      .then((r) => r.json())
      .then((data) => {
        if (data.key) {
          setTrailerKey(data.key);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setIsLoading(false));
  }, [movieId, mediaType]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative w-full max-w-4xl rounded-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ backgroundColor: "var(--card-bg)", borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="font-semibold text-sm truncate pr-4" style={{ color: "var(--primary)" }}>
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

        {/* Video area */}
        <div className="aspect-video bg-black flex items-center justify-center">
          {isLoading && (
            <p className="text-white/60 text-sm">Loading trailer...</p>
          )}
          {notFound && (
            <p className="text-white/60 text-sm">No trailer available</p>
          )}
          {trailerKey && (
            <iframe
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&rel=0`}
              title={`${movieTitle} trailer`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full h-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
