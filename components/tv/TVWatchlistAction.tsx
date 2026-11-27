"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { heroPrimaryButton, heroSecondaryButton } from "@/components/detail/buttonStyles";
import { CheckIcon, PlusIcon } from "@/components/detail/icons";
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
