"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { heroPrimaryButton, heroSecondaryButton } from "@/components/detail/buttonStyles";
import { CheckIcon, PlusIcon } from "@/components/detail/icons";
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

  const fetchEntry = useCallback(() => {
    Promise.all([
      fetch("/api/watchlist?status=WANT_TO_WATCH").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=WATCHED").then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch("/api/watchlist?status=NOT_INTERESTED").then((r) => r.json()).catch(() => ({ entries: [] })),
    ]).then(([want, watched, not]) => {
      const match = [...(want.entries || []), ...(watched.entries || []), ...(not.entries || [])].find(
        (e: ExistingEntry & { movieId?: number }) => e.movieId === movieId
      );
      setExistingEntry(match);
    });
  }, [movieId]);

  useEffect(() => {
    if (isLoggedIn) fetchEntry();
  }, [isLoggedIn, fetchEntry]);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(`/movie/${movieId}`)}`}
        className={heroPrimaryButton}
      >
        <PlusIcon />
        Sign in to add
      </Link>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={existingEntry ? heroSecondaryButton : heroPrimaryButton}
      >
        {existingEntry ? (
          <>
            <CheckIcon />
            On your list
          </>
        ) : (
          <>
            <PlusIcon />
            Want to Watch
          </>
        )}
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
