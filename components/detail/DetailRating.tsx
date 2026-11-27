"use client";

import toast from "react-hot-toast";
import { nextRating, normalizeRating } from "@/lib/detailRating";

const OPTIONS = [
  { value: 1, label: "Didn't like", icon: "👎" },
  { value: 2, label: "Like", icon: "👍" },
  { value: 3, label: "Love", icon: "♥" },
] as const;

interface DetailRatingProps {
  title: string;
  rating: number | null | undefined;
  /** Saves the new rating (0 clears). Should reject if saving fails. */
  onRate: (rating: number) => Promise<void>;
}

/** Thumb rating for the detail hero: same 1–3 scale as the poster cards. */
export default function DetailRating({ title, rating, onRate }: DetailRatingProps) {
  const current = normalizeRating(rating);

  async function pick(value: number) {
    try {
      await onRate(nextRating(current, value));
    } catch {
      toast.error("Failed to save rating");
    }
  }

  return (
    <div role="group" aria-label={`Your rating for ${title}`} className="inline-flex h-12 items-center gap-1 rounded-control border border-border bg-surface-2 px-1">
      {OPTIONS.map((o) => {
        const selected = current === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            aria-label={o.label}
            title={o.label}
            onClick={() => pick(o.value)}
            className={`flex h-11 min-w-11 cursor-pointer items-center justify-center rounded-chip px-2 text-[18px] leading-none transition-colors duration-150 hover:bg-surface ${
              selected ? "bg-text text-bg hover:bg-text" : "text-text"
            }`}
          >
            <span aria-hidden="true">{o.icon}</span>
          </button>
        );
      })}
    </div>
  );
}
