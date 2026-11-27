"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { tmdb } from "@/lib/tmdb";
import { detailHref, type MediaType } from "@/lib/posterCard";
import MovieDetailModal from "@/components/movies/MovieDetailModal";
import TVShowDetailModal from "@/components/tv/TVShowDetailModal";

/**
 * The one grid rule for poster lists (design review, "Grid"): 3 columns on
 * phones (2 under 360px), then as many ~150px columns as fit.
 */
export const POSTER_GRID =
  "grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:gap-4";

const RATINGS = [
  { value: 1, label: "Didn't like", icon: "👎" },
  { value: 2, label: "Like", icon: "👍" },
  { value: 3, label: "Love", icon: "♥" },
] as const;

const LONG_PRESS_MS = 500;

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
  /** Current thumb rating, 0 = none, 1–3. Shown in the ⋯ menu when onRate is set. */
  rating?: number | null;
  onRate?: (rating: number) => void;
  notInterested?: boolean;
  onNotInterested?: () => void;
  onTrailer?: () => void;
  onRemove?: () => void;
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
  rating,
  onRate,
  notInterested,
  onNotInterested,
  onTrailer,
  onRemove,
  children,
}: PosterCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const posterUrl = tmdb.getPosterUrl(posterPath);
  const hasMenu = !!(onRate || onNotInterested || onTrailer || onRemove);
  const pct = progress == null ? null : Math.round(progress * 100);

  // Place the menu against the viewport (not the poster, which is only ~110px
  // wide on a phone): right-aligned under the ⋯ button, clamped to the screen,
  // flipped above the button when there's no room below.
  useLayoutEffect(() => {
    if (!menuOpen) return;
    const btn = menuButtonRef.current?.getBoundingClientRect();
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const margin = 8;
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const left = Math.max(margin, Math.min(btn.right - w, vw - w - margin));
    let top = btn.bottom + 4;
    if (top + h > vh - margin) top = Math.max(margin, btn.top - 4 - h);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = "visible";
  }, [menuOpen]);

  // Close the menu on Escape (focus back to ⋯) and on a press outside the card.
  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    const onPointer = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    // The menu is fixed to the viewport, so it would drift from its card.
    const close = () => setMenuOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [menuOpen]);

  useEffect(() => () => clearPress(), []);

  function clearPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  // The click that follows a long-press fires right after pointerup. If the
  // finger dragged off the poster no click comes, so clear the flag afterwards
  // rather than let it swallow the next real click.
  function endPress() {
    clearPress();
    if (suppressClick.current) setTimeout(() => (suppressClick.current = false), 0);
  }

  // Long-press on the poster (touch) opens the ⋯ menu instead of the details.
  function onPointerDown(e: PointerEvent) {
    if (!hasMenu || e.pointerType !== "touch") return;
    suppressClick.current = false;
    clearPress();
    pressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  // A plain click opens the detail modal; new-tab clicks follow the real link.
  function onPosterClick(e: MouseEvent) {
    if (suppressClick.current) {
      e.preventDefault();
      suppressClick.current = false;
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setDetailOpen(true);
  }

  const pick = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  const menuItem =
    "flex w-full items-center gap-2 rounded-chip px-2 min-h-11 sm:min-h-9 text-left text-[13px] leading-[18px] text-text hover:bg-surface-2 cursor-pointer";

  return (
    <article className="group/card flex min-w-0 flex-col gap-2.5">
      <div ref={rootRef} className="relative aspect-[2/3] rounded-card bg-surface-2 shadow-card">
        <Link
          href={detailHref(mediaType, id)}
          prefetch={false}
          onClick={onPosterClick}
          onPointerDown={onPointerDown}
          onPointerUp={endPress}
          onPointerMove={clearPress}
          onPointerCancel={endPress}
          onContextMenu={(e) => {
            if (suppressClick.current || pressTimer.current) e.preventDefault();
          }}
          aria-label={`${title}: details`}
          className="absolute inset-0 select-none overflow-hidden rounded-card [-webkit-touch-callout:none]"
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

        {hasMenu && (
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={`More for ${title}`}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? menuId : undefined}
            className={`absolute right-2 top-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-opacity duration-150 motion-reduce:transition-none before:absolute before:-inset-1.5 before:content-[''] hover:bg-black/80 ${
              menuOpen
                ? "opacity-100"
                : "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/card:opacity-100 focus-visible:opacity-100"
            }`}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </button>
        )}

        {hasMenu && menuOpen && (
          <div
            ref={menuRef}
            id={menuId}
            role="group"
            aria-label={`Options for ${title}`}
            style={{ top: 0, left: 0, visibility: "hidden" }}
            className="fixed z-50 flex w-max min-w-40 max-w-[calc(100vw-16px)] flex-col gap-0.5 rounded-control border border-border bg-surface p-1 shadow-pop"
          >
            {onNotInterested && (
              <button
                type="button"
                aria-pressed={!!notInterested}
                onClick={pick(onNotInterested)}
                className={`${menuItem} ${notInterested ? "bg-surface-2 font-bold" : ""}`}
              >
                <span aria-hidden="true" className="w-4 text-center">✕</span>
                Not for me
              </button>
            )}
            {onRate &&
              RATINGS.map((r) => {
                const selected = rating === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={pick(() => onRate(selected ? 0 : r.value))}
                    className={`${menuItem} ${selected ? "bg-surface-2 font-bold" : ""}`}
                  >
                    <span aria-hidden="true" className="w-4 text-center">{r.icon}</span>
                    {r.label}
                  </button>
                );
              })}
            {onTrailer && (
              <button type="button" onClick={pick(onTrailer)} className={menuItem}>
                <span aria-hidden="true" className="w-4 text-center">▶</span>
                Trailer
              </button>
            )}
            {onRemove && (
              <button type="button" onClick={pick(onRemove)} className={`${menuItem} text-danger`}>
                <span aria-hidden="true" className="w-4 text-center">🗑</span>
                Remove
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onAdd}
          aria-label={onList ? `On your list: ${title}. Update` : `Add ${title} to a list`}
          className={`absolute bottom-2 right-2 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full shadow-card transition-colors duration-150 motion-reduce:transition-none before:absolute before:-inset-1 before:content-[''] ${
            onList ? "bg-text text-bg" : "bg-accent text-white hover:bg-accent-hover"
          }`}
        >
          {onList ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
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
