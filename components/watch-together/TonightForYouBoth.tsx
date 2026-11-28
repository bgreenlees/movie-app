"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { DEFAULT_SELECTION, type MoodSelection } from "@/lib/moodPicker";
import type { PairCandidate } from "@/lib/pairPool";
import {
  TONIGHT_COUNT,
  drawPairPicks,
  emptyKind,
  nextShuffle,
  pairPicksQuery,
  ratingsNudge,
  refillPicks,
} from "@/lib/pairPicks";
import PairCard, { type PairCardTitle } from "./PairCard";
import Skeleton from "@/components/ui/Skeleton";
import ErrorState from "@/components/ui/ErrorState";
import { POSTER_GRID } from "@/components/ui/PosterCard";

/** The `GET /api/watch-together/[userId]/picks` response. */
interface PicksData {
  partner: { id: string; name: string | null };
  pool: PairCandidate[];
  services: { mine: boolean; partners: boolean; shared: number[] };
  coldStart: { me: boolean; partner: boolean };
  /** Taste signals per person: numbers only */
  signals?: { me: number; partner: number };
  partial?: boolean;
}

const keyOf = (c: { mediaType: string; id: number }) => `${c.mediaType}-${c.id}`;

const buttonClass =
  "min-h-11 sm:min-h-9 px-4 py-1.5 text-sm rounded-md cursor-pointer transition-opacity hover:opacity-80";

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border px-4 py-3 text-sm mb-4"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
    >
      {children}
    </div>
  );
}

/** What the page needs to know to lay out its controls around the picks. */
export interface TonightMeta {
  /** Shuffle has something to draw from */
  canShuffle: boolean;
  /** Both people have saved services, so "Only services we both have" makes sense */
  bothHaveServices: boolean;
}

/**
 * "Tonight for you both" (spec §5.3, §7): `count` picks (12 or more) drawn from the pair pool
 * with a weighted shuffle, and a reason under each. The page owns the mood
 * controls, the media filter and the Shuffle button (What to Watch's header),
 * so this renders the picks area only: pass `selection`, and bump `shuffleKey`
 * to shuffle.
 */
export default function TonightForYouBoth({
  partnerId,
  partnerName,
  selection,
  sharedOnly,
  onSelectionChange,
  onSharedOnlyChange,
  shuffleKey,
  onMeta,
  onPartnerName,
  onNotFound,
  hasEntry,
  hidden,
  onAdd,
  onTrailer,
  count = TONIGHT_COUNT,
}: {
  partnerId: string;
  /** The partner's name once known, else null (the page may not have it yet) */
  partnerName: string | null;
  /** The page's mood selection (vibe, time, fresh, services, media) */
  selection: MoodSelection;
  /** "Only services we both have" */
  sharedOnly: boolean;
  /** The empty state's "Clear moods" / "Turn services off" buttons ask the page to change these */
  onSelectionChange: (next: MoodSelection) => void;
  onSharedOnlyChange: (sharedOnly: boolean) => void;
  /** Change this number to shuffle (the page's Shuffle button) */
  shuffleKey: number;
  /** Reports what the page's controls need; called when it changes */
  onMeta?: (meta: TonightMeta) => void;
  /** Called with the partner's name when the picks response arrives */
  onPartnerName?: (name: string | null) => void;
  /** Called when the picks route says the partner isn't a connection (404) */
  onNotFound?: () => void;
  /** Whether a title is already on one of my lists (Add vs Update) */
  hasEntry: (t: { id: number; mediaType: "movie" | "tv" }) => boolean;
  /** Keys (`movie-1`) I've since marked watched, watching or not interested: hidden and never redrawn */
  hidden: ReadonlySet<string>;
  onAdd: (t: PairCardTitle) => void;
  onTrailer: (t: PairCardTitle) => void;
  /** Picks to show: the page sizes this to fill complete grid rows (default 12) */
  count?: number;
}) {
  const query = pairPicksQuery(selection, sharedOnly);

  // The query the current data was loaded for; loading = data is for an older query
  const [loaded, setLoaded] = useState<{ partnerId: string; query: string; data: PicksData } | null>(null);
  const [picks, setPicks] = useState<PairCandidate[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  // Keys shown since the pool loaded, so Shuffle gives new titles while the pool lasts
  const seen = useRef<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  // The latest count, for the load effect (a resize must not refetch)
  const countRef = useRef(count);
  useEffect(() => {
    countRef.current = count;
  }, [count]);
  // Text for the screen-reader live line; `n` makes a repeat announcement count as new
  const [announcement, setAnnouncement] = useState<{ n: number; text: string }>({ n: 0, text: "" });
  const announce = (count: number) =>
    setAnnouncement((a) => ({ n: a.n + 1, text: count === 0 ? "No new picks" : `${count} new ${count === 1 ? "pick" : "picks"}` }));

  useEffect(() => {
    // Abort a stale request (quick chip clicks) so it stops costing TMDB calls
    const controller = new AbortController();
    (async () => {
      try {
        const qs = query ? `?${query}` : "";
        const res = await fetch(`/api/watch-together/${encodeURIComponent(partnerId)}/picks${qs}`, {
          signal: controller.signal,
        });
        if (res.status === 404) {
          if (!controller.signal.aborted) onNotFound?.();
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PicksData = await res.json();
        if (controller.signal.aborted) return;
        setFailed(null);
        setLoaded({ partnerId, query, data });
        const drawn = drawPairPicks(data.pool, { count: countRef.current });
        seen.current = new Set(drawn.map(keyOf));
        setPicks(drawn);
        // The first load isn't news; later loads (a mood change) are
        if (loadedOnce.current) announce(drawn.length);
        loadedOnce.current = true;
        onPartnerName?.(data.partner.name?.trim() || null);
      } catch {
        if (!controller.signal.aborted) setFailed(query);
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callbacks are stable enough; re-fetching on their identity would loop
  }, [partnerId, query, attempt]);

  const hasError = failed === query;
  const current = loaded?.partnerId === partnerId && loaded.query === query ? loaded : null;
  const isLoading = !current && !hasError;
  // Never another friend's picks: only data loaded for this partner counts
  const data = hasError ? undefined : loaded?.partnerId === partnerId ? loaded.data : undefined;
  // The pool minus anything I've hidden; the empty check and Shuffle use this, not the 12 on screen
  const pool = useMemo(() => (data?.pool ?? []).filter((c) => !hidden.has(keyOf(c))), [data, hidden]);
  const shown = picks.filter((p) => !hidden.has(keyOf(p)));

  // Hiding a pick (watched, not interested) tops the row back up from the pool
  // (Adjusting state while rendering, not in an effect: React re-renders at once, with no stale frame.)
  // The same goes for a new count (the window was resized): top up or trim to complete rows.
  const [refillBasis, setRefillBasis] = useState<{ pool: unknown; hidden: unknown; count: number } | null>(null);
  if (current && (refillBasis?.pool !== pool || refillBasis?.hidden !== hidden || refillBasis?.count !== count)) {
    setRefillBasis({ pool, hidden, count });
    setPicks(refillPicks(picks, pool, hidden, { count }));
  }

  const shuffle = () => {
    const next = nextShuffle(pool, new Set([...seen.current, ...shown.map(keyOf)]), { count });
    seen.current = next.seen;
    setPicks(next.picks);
    announce(next.picks.length);
  };
  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };
  // Clearing the moods keeps the media filter: it isn't a mood
  const clearMoods = () => {
    onSharedOnlyChange(false);
    onSelectionChange({ ...DEFAULT_SELECTION, media: selection.media });
  };

  // Shown until each person has 10 signals, with their own count (numbers only from the API)
  const myNudge = ratingsNudge(data?.signals?.me);
  const partnerNudge = ratingsNudge(data?.signals?.partner);
  const bothHaveServices = !!data?.services.mine && !!data?.services.partners;
  const noServices = data && !data.services.mine && !data.services.partners;
  const empty = emptyKind(selection);

  // The page's Shuffle button bumps shuffleKey; the first value is the initial render, not a shuffle
  const lastShuffleKey = useRef(shuffleKey);
  useEffect(() => {
    if (lastShuffleKey.current === shuffleKey) return;
    lastShuffleKey.current = shuffleKey;
    shuffle();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new shuffleKey should shuffle
  }, [shuffleKey]);

  const canShuffle = !isLoading && !hasError && pool.length > 0;
  useEffect(() => {
    onMeta?.({ canShuffle, bothHaveServices });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the values change
  }, [canShuffle, bothHaveServices]);

  return (
    <section aria-label="Picks for you both">
      <div className="mb-4">
        {partnerNudge && (
          <Notice>
            {partnerName ?? "Your friend"} has rated {partnerNudge.count} of {partnerNudge.target}, so picks lean on
            your taste.
          </Notice>
        )}
        {myNudge && (
          <Notice>
            You&apos;ve rated {myNudge.count} of {myNudge.target} — rate a few more so picks fit you both.{" "}
            <Link href="/watched" className="underline" style={{ color: "var(--accent)" }}>
              Go to My Movies
            </Link>
          </Notice>
        )}
        {selection.onMyServices && noServices && (
          <Notice>
            Neither of you has saved streaming services, so this shows everything.{" "}
            <Link href="/profile" className="underline" style={{ color: "var(--accent)" }}>
              Add your services in Profile
            </Link>
          </Notice>
        )}
      </div>

      <p role="status" className="sr-only">
        <span key={announcement.n}>{announcement.text}</span>
      </p>

      <div aria-busy={isLoading}>
        {hasError ? (
          <ErrorState title="Couldn't load picks for you both" onRetry={retry} />
        ) : isLoading && !data ? (
          <Skeleton count={count} label="Loading picks for you both" />
        ) : pool.length === 0 && !isLoading ? (
          <div className="rounded-lg border px-6 py-10 text-center" style={{ borderColor: "var(--border)" }}>
            <p className="font-bold mb-1" style={{ color: "var(--foreground)" }}>
              {empty === "services"
                ? sharedOnly && data?.services.shared.length === 0
                  ? "You don't have any services in common"
                  : "Nothing fits those moods on your services"
                : empty === "mood"
                  ? "Nothing fits those moods"
                  : "Nothing to suggest yet"}
            </p>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              {empty === "none"
                ? `Add a few titles to your lists, and ask ${partnerName ?? "your friend"} to do the same.`
                : "Try loosening the filters."}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              {empty === "services" && (
                <button
                  onClick={() => {
                    onSharedOnlyChange(false);
                    onSelectionChange({ ...selection, onMyServices: false });
                  }}
                  className={`${buttonClass} text-white`}
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  Turn services off
                </button>
              )}
              {empty !== "none" && (
                <button onClick={clearMoods} className={buttonClass} style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}>
                  Clear moods
                </button>
              )}
            </div>
          </div>
        ) : (
          <>
            {data?.partial && (
              <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                Some picks couldn&apos;t load, so this set may be smaller than usual.
              </p>
            )}
            <ul className={`${POSTER_GRID} transition-opacity`} style={{ opacity: isLoading ? 0.5 : 1 }}>
              {shown.map((p) => {
                const item: PairCardTitle = {
                  id: p.id, mediaType: p.mediaType, title: p.title,
                  posterPath: p.posterPath, date: p.date || null, overview: p.overview,
                };
                return (
                  <li key={keyOf(p)}>
                    <PairCard
                      item={item}
                      caption={p.reason}
                      hasEntry={p.onMyList || hasEntry(p)}
                      onAdd={() => onAdd(item)}
                      onTrailer={() => onTrailer(item)}
                    />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
