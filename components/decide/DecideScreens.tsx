"use client";

import Image from "next/image";
import Link from "next/link";
import TrailerButton from "@/components/ui/TrailerButton";
import MovieWatchlistAction from "@/components/movies/MovieWatchlistAction";
import TVWatchlistAction from "@/components/tv/TVWatchlistAction";
import { heroSecondaryButton, heroPrimaryButton } from "@/components/detail/buttonStyles";
import { cardMeta, type DecideCandidateView, type DecideSessionView } from "@/lib/decideView";
import { getPosterUrl } from "@/lib/tmdbImages";

const detailHref = (c: Pick<DecideCandidateView, "mediaType" | "tmdbId">) => `/${c.mediaType}/${c.tmdbId}`;

function Shell({ children, labelledBy }: { children: React.ReactNode; labelledBy: string }) {
  return (
    <section aria-labelledby={labelledBy} className="mx-auto flex w-full max-w-md flex-col items-center gap-4 text-center">
      {children}
    </section>
  );
}

/** "Waiting for Sam… 6 of 10" (§5.3 step 4). Only a count, never the partner's votes. */
export function WaitScreen({
  partner,
  progress,
  reconnecting,
  onUndo,
}: {
  partner: string;
  progress: DecideSessionView["partnerProgress"];
  reconnecting: boolean;
  onUndo: () => void;
}) {
  const pct = progress.total > 0 ? Math.round((progress.voted / progress.total) * 100) : 0;
  return (
    <Shell labelledBy="wait-title">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl">
        ⏳
      </span>
      <h1 id="wait-title" className="text-h1 text-text">
        Waiting for {partner}…
      </h1>
      <div className="w-full max-w-xs">
        <div
          role="progressbar"
          aria-label={`${partner}'s progress`}
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.voted}
          className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-meta text-muted" aria-live="polite">
          {progress.voted} of {progress.total}
        </p>
      </div>
      <p className="text-meta text-muted">
        You&apos;ve voted on all {progress.total}. We&apos;ll show the result as soon as {partner} finishes.
      </p>
      {reconnecting && (
        <p role="status" className="text-meta text-warning">
          Reconnecting…
        </p>
      )}
      <button type="button" onClick={onUndo} className={`${heroSecondaryButton} cursor-pointer`}>
        Undo last vote
      </button>
    </Shell>
  );
}

function Poster({ c, size }: { c: DecideCandidateView; size: "lg" | "sm" }) {
  const url = getPosterUrl(c.posterPath);
  return (
    <div
      className={`relative aspect-[2/3] overflow-hidden rounded-card bg-surface-2 shadow-card ${size === "lg" ? "w-48 sm:w-60" : "w-24"}`}
    >
      {url ? (
        <Image src={url} alt="" fill className="object-cover" sizes={size === "lg" ? "240px" : "96px"} />
      ) : (
        <span className="flex h-full items-center justify-center p-2 text-meta text-muted">{c.title}</span>
      )}
    </div>
  );
}

/** The winner big, with where to watch and a trailer, plus up to 2 runners-up (§5.3 step 5). */
export function RevealScreen({
  result,
  partner,
  doneHref,
}: {
  result: NonNullable<DecideSessionView["result"]>;
  partner: string;
  doneHref: string;
}) {
  const w = result.winner;
  const eyebrow = result.picked
    ? "Picked for you"
    : result.bothReallyWant
      ? "You both really want this"
      : `It's a match with ${partner}`;
  return (
    <Shell labelledBy="reveal-title">
      <p className="text-label uppercase text-accent-text">{eyebrow}</p>
      <Poster c={w} size="lg" />
      <div>
        <h1 id="reveal-title" className="text-h1 text-text">
          {w.title}
        </h1>
        <p className="text-meta text-muted">{cardMeta(w)}</p>
        {w.reason && <p className="mt-1 text-meta text-text">{w.reason}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {w.mediaType === "movie" ? (
          <MovieWatchlistAction movieId={w.tmdbId} movieTitle={w.title} isLoggedIn />
        ) : (
          <TVWatchlistAction tvShowId={w.tmdbId} tvShowName={w.title} isLoggedIn />
        )}
        <TrailerButton id={w.tmdbId} title={w.title} mediaType={w.mediaType} className={`${heroSecondaryButton} cursor-pointer`} />
        <Link href={detailHref(w)} className={heroSecondaryButton}>
          Where to watch
        </Link>
      </div>

      {result.alsoMatched.length > 0 && (
        <div className="mt-4 w-full">
          <h2 className="mb-3 text-label uppercase text-muted">Also matched</h2>
          <ul className="flex justify-center gap-4">
            {result.alsoMatched.map((c) => (
              <li key={c.id}>
                <Link href={detailHref(c)} className="flex w-24 flex-col items-center gap-1.5">
                  <Poster c={c} size="sm" />
                  <span className="line-clamp-2 text-meta text-text">{c.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Link href={doneHref} className={`${heroPrimaryButton} mt-4`}>
        Done
      </Link>
    </Shell>
  );
}

/** "No match this time" (§5.3 step 6): Try 10 more (up to 3 rounds) or Just pick for us. */
export function NoMatchScreen({
  canTryMore,
  busy,
  error,
  reconnecting,
  onTryMore,
  onPick,
}: {
  canTryMore: boolean;
  busy: "next" | "pick" | null;
  error: string | null;
  reconnecting: boolean;
  onTryMore: () => void;
  onPick: () => void;
}) {
  return (
    <Shell labelledBy="nomatch-title">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl">
        🤷
      </span>
      <h1 id="nomatch-title" className="text-h1 text-text">
        No match this time
      </h1>
      <p className="text-meta text-muted">
        {canTryMore ? "Vote on 10 more, or let us choose." : "That was the last round. Let us choose for you."}
      </p>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
        {canTryMore && (
          <button
            type="button"
            onClick={onTryMore}
            disabled={busy !== null}
            className={`${heroPrimaryButton} cursor-pointer`}
          >
            {busy === "next" ? "Loading…" : "Try 10 more"}
          </button>
        )}
        <button
          type="button"
          onClick={onPick}
          disabled={busy !== null}
          className={`${canTryMore ? heroSecondaryButton : heroPrimaryButton} cursor-pointer`}
        >
          {busy === "pick" ? "Picking…" : "Just pick for us"}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-meta text-danger">
          {error}
        </p>
      )}
      {reconnecting && (
        <p role="status" className="text-meta text-warning">
          Reconnecting…
        </p>
      )}
    </Shell>
  );
}

/** Expired (6 h) or cancelled (§5.3 states): "This vote has ended" with Start a new one. */
export function EndedScreen({ startHref }: { startHref: string }) {
  return (
    <Shell labelledBy="ended-title">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-2xl">
        🎬
      </span>
      <h1 id="ended-title" className="text-h1 text-text">
        This vote has ended
      </h1>
      <p className="text-meta text-muted">It was cancelled or it ran out of time. Votes last 6 hours.</p>
      <Link href={startHref} className={heroPrimaryButton}>
        Start a new one
      </Link>
    </Shell>
  );
}
