"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AddTVModal from "./AddTVModal";

interface ExistingTVEntry {
  id: string;
  status: string;
  platform?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

interface TVWatchlistActionProps {
  tvShowId: number;
  tvShowName: string;
  isLoggedIn: boolean;
}

export default function TVWatchlistAction({ tvShowId, tvShowName, isLoggedIn }: TVWatchlistActionProps) {
  const [open, setOpen] = useState(false);
  const [existingEntry, setExistingEntry] = useState<ExistingTVEntry | undefined>(undefined);

  const fetchEntry = () => {
    fetch("/api/tv/watchlist")
      .then((r) => r.json())
      .then((d) => {
        const match = (d.entries || []).find((e: any) => e.tvShowId === tvShowId);
        setExistingEntry(match);
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (isLoggedIn) fetchEntry();
  }, [isLoggedIn, tvShowId]);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(`/tv/${tvShowId}`)}`}
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
      <AddTVModal
        isOpen={open}
        onClose={() => setOpen(false)}
        tvShowId={tvShowId}
        tvShowName={tvShowName}
        existingEntry={existingEntry}
        onSuccess={() => { setOpen(false); fetchEntry(); }}
      />
    </>
  );
}
