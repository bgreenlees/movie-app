"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AddMovieModal from "./AddMovieModal";

interface ExistingEntry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
}

interface MovieWatchlistActionProps {
  movieId: number;
  movieTitle: string;
  isLoggedIn: boolean;
}

export default function MovieWatchlistAction({ movieId, movieTitle, isLoggedIn }: MovieWatchlistActionProps) {
  const [open, setOpen] = useState(false);
  const [existingEntry, setExistingEntry] = useState<ExistingEntry | undefined>(undefined);

  const fetchEntry = () => {
    Promise.all([
      fetch("/api/watchlist?status=WANT_TO_WATCH").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=WATCHED").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=NOT_INTERESTED").then((r) => r.json()).catch(() => ({ entries: [] })),
    ]).then(([want, watched, not]) => {
      const match = [...(want.entries || []), ...(watched.entries || []), ...(not.entries || [])].find(
        (e: any) => e.movieId === movieId
      );
      setExistingEntry(match);
    });
  };

  useEffect(() => {
    if (isLoggedIn) fetchEntry();
  }, [isLoggedIn, movieId]);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(`/movie/${movieId}`)}`}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--accent)" }}
      >
        Sign in to Add
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-opacity hover:opacity-90"
        style={{ backgroundColor: existingEntry ? "var(--border)" : "var(--accent)", color: existingEntry ? "var(--foreground)" : "white" }}
      >
        {existingEntry ? "✓ On Your List" : "+ Add to Watchlist"}
      </button>
      <AddMovieModal
        isOpen={open}
        onClose={() => setOpen(false)}
        movieId={movieId}
        movieTitle={movieTitle}
        existingEntry={existingEntry}
        onSuccess={() => { setOpen(false); fetchEntry(); }}
      />
    </>
  );
}
