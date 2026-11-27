"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type MouseEvent, type ReactNode } from "react";
import { getPosterUrl } from "@/lib/tmdbImages";
import { detailHref, type MediaType } from "@/lib/posterCard";
import MovieDetailModal from "@/components/movies/MovieDetailModal";
import TVShowDetailModal from "@/components/tv/TVShowDetailModal";

/**
 * The one grid rule for poster lists (design review, "Grid"): 3 columns on
 * phones (2 under 360px), then as many ~150px columns as fit.
 */
export const POSTER_GRID =
  "grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:gap-4";

// Every control on a poster shares one style (design D2): a 32px circle with a
// shadow, and a 44px tap area from the ::before. White and purple are fixed
// colours, not theme tokens, so they read on dark and bright art in both themes.
// Purple means only "on your list".
const POSTER_CONTROL =
  "absolute flex h-8 w-8 cursor-pointer items-center justify-center rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.5)] transition-colors duration-150 motion-reduce:transition-none before:absolute before:-inset-1.5 before:content-['']";
const CONTROL_WHITE = "bg-[#f4f4f6] text-[#0b0b0f] hover:bg-white";
const CONTROL_PURPLE = "bg-accent text-white hover:bg-accent-hover";

export interface PosterCardProps {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  overview?: string;
  /** Muted line under the title: "2024 · Movie", "S2 · E3" … */
  meta?: string | null;
  /** 0–1 share of the current season watched; draws the 3px accent bar. */
  progress?: number | null;
  /** Top-left chip ("Watching", "Want", "Seen ♥"). Pass it on My lists only. */
  statusChip?: string | null;
  /** Already on one of my lists: the action shows ✓ instead of +. */
  onList?: boolean;
  /** The one action: opens the Add / Update sheet. */
  onAdd: () => void;
  /** Shows the play button (bottom left) and opens the trailer. Omit when there is none. */
  onTrailer?: () => void;
  /** Extra lines under the caption (e.g. a "why" line, next episode). */
  children?: ReactNode;
}

export default function PosterCard({
  id,
  mediaType,
  title,
  posterPath,
  overview,
  meta,
  progress,
  statusChip,
  onList = false,
  onAdd,
  onTrailer,
  children,
}: PosterCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const posterUrl = getPosterUrl(posterPath);
  const pct = progress == null ? null : Math.round(progress * 100);

  // A plain click opens the detail modal; new-tab clicks follow the real link.
  function onPosterClick(e: MouseEvent) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setDetailOpen(true);
  }

  return (
    <article className="group/card flex min-w-0 flex-col gap-2.5">
      <div className="relative aspect-[2/3] rounded-card bg-surface-2 shadow-card">
        <Link
          href={detailHref(mediaType, id)}
          prefetch={false}
          onClick={onPosterClick}
          aria-label={`${title}: details`}
          className="absolute inset-0 select-none overflow-hidden rounded-card"
        >
          {posterUrl ? (
            <Image
              src={posterUrl}
              alt=""
              fill
              draggable={false}
              className="object-cover transition-transform duration-150 motion-reduce:transition-none group-hover/card:scale-[1.02]"
              sizes="(max-width: 640px) 34vw, 200px"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center p-3 text-center text-[13px] leading-[18px] text-muted">
              {title}
            </span>
          )}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgb(0_0_0/0.7),transparent_45%)]"
          />
        </Link>

        {statusChip && (
          <span className="pointer-events-none absolute left-2 top-2 rounded-chip bg-bg/85 px-2 py-1 text-[12px] font-bold uppercase leading-4 tracking-[0.06em] text-accent-text">
            {statusChip}
          </span>
        )}

        {onTrailer && (
          <button
            type="button"
            onClick={onTrailer}
            aria-label={`Watch trailer: ${title}`}
            className={`${POSTER_CONTROL} bottom-2 left-2 ${CONTROL_WHITE}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M8 5.14v13.72a1 1 0 0 0 1.52.85l11-6.86a1 1 0 0 0 0-1.7l-11-6.86A1 1 0 0 0 8 5.14z" />
            </svg>
          </button>
        )}

        <button
          type="button"
          onClick={onAdd}
          aria-label={onList ? `On your list: ${title}. Update` : `Add ${title} to a list`}
          className={`${POSTER_CONTROL} bottom-2 right-2 ${onList ? CONTROL_PURPLE : CONTROL_WHITE}`}
        >
          {onList ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" aria-hidden="true">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex min-w-0 flex-col gap-0.5">
        <h3 className="truncate text-[15px] font-bold leading-5 text-text" title={title}>
          {title}
        </h3>
        {meta && <p className="text-[13px] leading-[18px] text-muted">{meta}</p>}
        {pct != null && (
          <div
            role="img"
            aria-label={`${pct}% of season watched`}
            className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-border"
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        )}
        {children}
      </div>

      {mediaType === "movie" ? (
        <MovieDetailModal
          movieId={detailOpen ? id : null}
          movieTitle={title}
          posterPath={posterPath}
          overview={overview}
          onClose={() => setDetailOpen(false)}
        />
      ) : (
        <TVShowDetailModal
          tvId={detailOpen ? id : null}
          tvName={title}
          posterPath={posterPath}
          overview={overview}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </article>
  );
}
