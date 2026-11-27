"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import type { Vote } from "@/lib/decide";
import { cardMeta, voteForSwipe, type DecideCandidateView } from "@/lib/decideView";
import { getPosterUrl } from "@/lib/tmdbImages";

const VOTES: { vote: Vote; label: string; icon: string; key: string }[] = [
  { vote: 0, label: "No", icon: "👎", key: "←" },
  { vote: 2, label: "Really want", icon: "❤️", key: "↑" },
  { vote: 1, label: "Yes", icon: "👍", key: "→" },
];

/**
 * One title to vote on (spec §5.3 step 3, §7): poster, title, year · runtime,
 * the "why" line and three 44 px buttons. Swipe left / right / up on touch;
 * the page handles the ← → ↑ keys.
 */
export default function VoteCard({
  candidate,
  position,
  total,
  currentVote,
  saving,
  onVote,
}: {
  candidate: DecideCandidateView;
  /** 1-based position in the round */
  position: number;
  total: number;
  /** My vote on this card if I've already voted (after an Undo) */
  currentVote: Vote | undefined;
  saving: boolean;
  onVote: (vote: Vote) => void;
}) {
  const posterUrl = getPosterUrl(candidate.posterPath);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const [drag, setDrag] = useState({ dx: 0, dy: 0 });

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" || saving) return; // swipe is for touch and pen; mouse uses buttons and keys
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!start.current || start.current.id !== e.pointerId) return;
    setDrag({ dx: e.clientX - start.current.x, dy: Math.min(0, e.clientY - start.current.y) });
  }
  function onPointerEnd(e: React.PointerEvent, cancelled = false) {
    if (!start.current || start.current.id !== e.pointerId) return;
    const vote = cancelled ? null : voteForSwipe(e.clientX - start.current.x, e.clientY - start.current.y);
    start.current = null;
    setDrag({ dx: 0, dy: 0 });
    if (vote !== null) onVote(vote);
  }

  const hint = voteForSwipe(drag.dx, drag.dy);

  return (
    <section aria-labelledby="vote-title" className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <p className="text-center text-meta text-muted" aria-live="polite">
        {position} of {total}
      </p>

      <div
        className="relative mx-auto aspect-[2/3] w-full max-w-[min(20rem,calc((100dvh-22rem)*2/3))] min-w-[12rem] touch-none select-none rounded-card bg-surface-2 shadow-card transition-transform duration-150 motion-reduce:transition-none"
        style={{
          transform: drag.dx || drag.dy ? `translate(${drag.dx}px, ${drag.dy}px) rotate(${drag.dx / 20}deg)` : undefined,
          transitionDuration: drag.dx || drag.dy ? "0ms" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerEnd(e)}
        onPointerCancel={(e) => onPointerEnd(e, true)}
      >
        {posterUrl ? (
          <Image
            src={posterUrl}
            alt=""
            fill
            draggable={false}
            priority
            className="rounded-card object-cover"
            sizes="(max-width: 640px) 80vw, 320px"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-6 text-center text-h2 text-muted">
            {candidate.title}
          </span>
        )}
        {hint !== null && (
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-4 -translate-x-1/2 rounded-chip bg-bg/85 px-3 py-1 text-label uppercase text-accent-text"
          >
            {VOTES.find((v) => v.vote === hint)?.label}
          </span>
        )}
      </div>

      <div className="text-center">
        <h1 id="vote-title" className="text-h2 text-text">
          {candidate.title}
        </h1>
        <p className="text-meta text-muted">{cardMeta(candidate)}</p>
        {candidate.reason && <p className="mt-1 text-meta text-text">{candidate.reason}</p>}
      </div>

      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Your vote">
        {VOTES.map((v) => {
          const chosen = currentVote === v.vote;
          return (
            <button
              key={v.vote}
              type="button"
              onClick={() => onVote(v.vote)}
              disabled={saving}
              aria-pressed={chosen}
              aria-keyshortcuts={v.key === "←" ? "ArrowLeft" : v.key === "→" ? "ArrowRight" : "ArrowUp"}
              className={`flex min-h-11 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-control border px-2 py-2 text-sm font-bold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-wait disabled:opacity-60 ${
                chosen
                  ? "border-accent bg-accent text-white"
                  : v.vote === 2
                    ? "border-border bg-surface-2 text-text hover:bg-surface"
                    : "border-border bg-surface text-text hover:bg-surface-2"
              }`}
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {v.icon}
              </span>
              {v.label}
            </button>
          );
        })}
      </div>
      <p className="hidden text-center text-label text-muted sm:block" aria-hidden="true">
        Keys: ← No · ↑ Really want · → Yes
      </p>
    </section>
  );
}
