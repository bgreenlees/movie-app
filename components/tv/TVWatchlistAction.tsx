"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { heroPrimaryButton, heroSecondaryButton } from "@/components/detail/buttonStyles";
import { CheckIcon, PlusIcon } from "@/components/detail/icons";
import DetailRating from "@/components/detail/DetailRating";
import { buildRateRequest } from "@/lib/detailRating";
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

  const fetchEntry = useCallback(() => {
    fetch("/api/tv/watchlist")
      .then((r) => r.json())
      .then((d) => {
        const match = (d.entries || []).find((e: ExistingTVEntry & { tvShowId?: number }) => e.tvShowId === tvShowId);
        setExistingEntry(match);
      })
      .catch(() => {});
  }, [tvShowId]);

  useEffect(() => {
    if (isLoggedIn) fetchEntry();
  }, [isLoggedIn, fetchEntry]);

  if (!isLoggedIn) {
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(`/tv/${tvShowId}`)}`}
        className={heroPrimaryButton}
      >
        <PlusIcon />
        Sign in to add
      </Link>
    );
  }

  // Same calls the poster cards make: update the entry, or add it as Watched.
  async function handleRate(rating: number) {
    const req = buildRateRequest("tv", tvShowId, existingEntry?.id ?? null, rating);
    if (!req) return;
    const previous = existingEntry;
    if (previous) setExistingEntry({ ...previous, rating: rating || null });
    try {
      const res = await fetch(req.url, { method: req.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      if (!res.ok) throw new Error("rate failed");
      if (!previous) fetchEntry();
    } catch (err) {
      setExistingEntry(previous);
      throw err;
    }
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
      <DetailRating title={tvShowName} rating={existingEntry?.rating} onRate={handleRate} />
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
