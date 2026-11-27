"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MoodControls from "@/components/mood/MoodControls";
import { DEFAULT_SELECTION, type MoodSelection } from "@/lib/moodPicker";
import type { PairCandidate } from "@/lib/pairPool";
import { TONIGHT_COUNT, drawPairPicks, emptyKind, pairPicksQuery } from "@/lib/pairPicks";
import PairCard, { type PairCardTitle } from "./PairCard";

/** The `GET /api/watch-together/[userId]/picks` response. */
interface PicksData {
  partner: { id: string; name: string | null };
  pool: PairCandidate[];
  services: { mine: boolean; partners: boolean; shared: number[] };
  coldStart: { me: boolean; partner: boolean };
  partial?: boolean;
}

const keyOf = (c: { mediaType: string; id: number }) => `${c.mediaType}-${c.id}`;

/** 5 cards in one row on desktop, 3 columns on phones (2 under 360px). */
const TONIGHT_GRID = "grid grid-cols-2 min-[360px]:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4";

const buttonClass =
  "min-h-11 sm:min-h-9 px-4 py-1.5 text-sm rounded-md cursor-pointer transition-opacity hover:opacity-80";

function Skeletons() {
  return (
    <div className={TONIGHT_GRID} aria-hidden="true">
      {Array.from({ length: TONIGHT_COUNT }, (_, i) => (
        <div key={i} className="rounded-lg overflow-hidden border" style={{ borderColor: "var(--border)" }}>
          <div className="aspect-[2/3] animate-pulse motion-reduce:animate-none" style={{ backgroundColor: "var(--hover-bg)" }} />
          <div className="p-3 space-y-2">
            <div className="h-3 w-3/4 rounded animate-pulse motion-reduce:animate-none" style={{ backgroundColor: "var(--hover-bg)" }} />
            <div className="h-3 w-1/2 rounded animate-pulse motion-reduce:animate-none" style={{ backgroundColor: "var(--hover-bg)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

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
 * "Tonight for you both" (spec §5.3, §7): mood controls, 5 picks drawn from
 * the pair pool with a weighted shuffle, a reason under each, and Shuffle.
 */
export default function TonightForYouBoth({
  partnerId,
  partnerName,
  hasEntry,
  hidden,
  onAdd,
  onTrailer,
}: {
  partnerId: string;
  partnerName: string;
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
  const [loaded, setLoaded] = useState<{ query: string; data: PicksData } | null>(null);
  const [picks, setPicks] = useState<PairCandidate[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Abort a stale request (quick chip clicks) so it stops costing TMDB calls
    const controller = new AbortController();
    (async () => {
      try {
        const qs = query ? `?${query}` : "";
        const res = await fetch(`/api/watch-together/${encodeURIComponent(partnerId)}/picks${qs}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PicksData = await res.json();
        if (controller.signal.aborted) return;
        setFailed(null);
        setLoaded({ query, data });
        setPicks(drawPairPicks(data.pool));
      } catch {
        if (!controller.signal.aborted) setFailed(query);
      }
    })();
    return () => controller.abort();
  }, [partnerId, query, attempt]);

  const hasError = failed === query;
  const isLoading = loaded?.query !== query && !hasError;
  const data = hasError ? undefined : loaded?.data;
  const pool = (data?.pool ?? []).filter((c) => !hidden.has(keyOf(c)));
  const shown = picks.filter((p) => !hidden.has(keyOf(p)));

  const shuffle = () => setPicks(drawPairPicks(pool, { avoid: new Set(shown.map(keyOf)) }));
  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };
  const clearMoods = () => {
    setSharedOnly(false);
    setSelection(DEFAULT_SELECTION);
  };

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
        showBothHave={bothHaveServices && selection.onMyServices}
        bothHave={sharedOnly}
        onBothHaveChange={setSharedOnly}
      />

      <div className="mt-4">
        {data?.coldStart.partner && (
          <Notice>
            {partnerName} hasn&apos;t rated much yet, so picks lean on your taste.
          </Notice>
        )}
        {data?.coldStart.me && (
          <Notice>
            Rate a few things you&apos;ve seen so picks fit you both.{" "}
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

      <div aria-live="polite" aria-busy={isLoading}>
        {hasError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 py-6">
            <p style={{ color: "var(--text-muted)" }}>Couldn&apos;t load picks for you both.</p>
            <button onClick={retry} className={buttonClass} style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}>
              Retry
            </button>
          </div>
        ) : isLoading && !data ? (
          <Skeletons />
        ) : shown.length === 0 && !isLoading ? (
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
                ? `Add a few titles to your lists, and ask ${partnerName} to do the same.`
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
            <ul className={`${TONIGHT_GRID} transition-opacity`} style={{ opacity: isLoading ? 0.5 : 1 }}>
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
