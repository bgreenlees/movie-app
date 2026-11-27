"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import MoodControls from "@/components/mood/MoodControls";
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

/**
 * "Tonight for you both" (spec §5.3, §7): mood controls, 12 picks drawn from
 * the pair pool with a weighted shuffle, a reason under each, and Shuffle.
 */
export default function TonightForYouBoth({
  partnerId,
  partnerName,
  onPartnerName,
  onNotFound,
  hasEntry,
  hidden,
  onAdd,
  onTrailer,
}: {
  partnerId: string;
  /** The partner's name once known, else null (the page may not have it yet) */
  partnerName: string | null;
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
}) {
  const [selection, setSelection] = useState<MoodSelection>(DEFAULT_SELECTION);
  const [sharedOnly, setSharedOnly] = useState(false);
  const query = pairPicksQuery(selection, sharedOnly);

  // The query the current data was loaded for; loading = data is for an older query
  const [loaded, setLoaded] = useState<{ partnerId: string; query: string; data: PicksData } | null>(null);
  const [picks, setPicks] = useState<PairCandidate[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const loadedOnce = useRef(false);
  // Keys shown since the pool loaded, so Shuffle gives new titles while the pool lasts
  const seen = useRef<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
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
        const drawn = drawPairPicks(data.pool);
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
  const [refillBasis, setRefillBasis] = useState<{ pool: unknown; hidden: unknown } | null>(null);
  if (current && (refillBasis?.pool !== pool || refillBasis?.hidden !== hidden)) {
    setRefillBasis({ pool, hidden });
    setPicks(refillPicks(picks, pool, hidden));
  }

  const shuffle = () => {
    const next = nextShuffle(pool, new Set([...seen.current, ...shown.map(keyOf)]));
    seen.current = next.seen;
    setPicks(next.picks);
    announce(next.picks.length);
  };
  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };
  const clearMoods = () => {
    setSharedOnly(false);
    setSelection(DEFAULT_SELECTION);
  };

  // Shown until each person has 10 signals, with their own count (numbers only from the API)
  const myNudge = ratingsNudge(data?.signals?.me);
  const partnerNudge = ratingsNudge(data?.signals?.partner);
  const bothHaveServices = !!data?.services.mine && !!data?.services.partners;
  const noServices = data && !data.services.mine && !data.services.partners;
  const empty = emptyKind(selection);

  return (
    <section aria-labelledby="tonight-heading" className="mb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <h2 id="tonight-heading" className="text-2xl font-bold" style={{ color: "var(--primary)" }}>
          Tonight for you both
        </h2>
        <button
          onClick={shuffle}
          disabled={isLoading || hasError || pool.length === 0}
          className="flex items-center gap-1.5 min-h-11 sm:min-h-9 px-4 py-1.5 text-white text-sm rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "var(--accent)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Shuffle
        </button>
      </div>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        Movies and shows you&apos;re both likely to enjoy, nothing either of you has seen.
      </p>

      <MoodControls
        hideMedia
        value={selection}
        onChange={setSelection}
        servicesLabel="On our services"
        showBothHave={bothHaveServices && selection.onMyServices}
        bothHave={sharedOnly}
        onBothHaveChange={setSharedOnly}
      />

      <div className="mt-4">
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
          <Skeleton count={TONIGHT_COUNT} label="Loading picks for you both" />
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
                    setSharedOnly(false);
                    setSelection((s) => ({ ...s, onMyServices: false }));
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
