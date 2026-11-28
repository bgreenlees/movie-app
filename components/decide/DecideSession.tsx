"use client";

import { whatToWatchWithHref } from "@/lib/watchWith";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Vote } from "@/lib/decide";
import {
  RECONNECT_AFTER_FAILURES,
  TOAST_MS,
  isRetryableStatus,
  loginHrefFor,
  firstUnvotedIndex,
  nextUnvotedIndex,
  partnerLabel,
  pollInterval,
  screenFor,
  voteForKey,
  type DecideSessionView,
  type Screen,
} from "@/lib/decideView";
import ErrorState from "@/components/ui/ErrorState";
import { SkeletonBlock } from "@/components/ui/Skeleton";
import MainNotFound from "@/app/(main)/not-found";
import VoteCard from "./VoteCard";
import {
  EndedScreen,
  NoMatchScreen,
  RevealScreen,
  WaitScreen,
} from "./DecideScreens";

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not-found" }
  | { kind: "ready"; data: DecideSessionView };

const VOTE_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readError(res: Response): Promise<string | null> {
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

function CardSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="mx-auto flex w-full max-w-sm flex-col items-center gap-4"
    >
      <span className="sr-only">Loading the vote…</span>
      <SkeletonBlock className="aspect-[2/3] w-full max-w-[20rem]" />
      <SkeletonBlock className="h-6 w-2/3 !rounded-chip" />
      <SkeletonBlock className="h-4 w-1/3 !rounded-chip" />
      <div className="grid w-full grid-cols-3 gap-2">
        <SkeletonBlock className="h-14 !rounded-control" />
        <SkeletonBlock className="h-14 !rounded-control" />
        <SkeletonBlock className="h-14 !rounded-control" />
      </div>
    </div>
  );
}

/**
 * The decide screen, `/decide/[sessionId]` (spec §5.3, §7): vote on the
 * round's cards, wait for the partner (polled every 3 s), then the reveal or
 * "no match". Expired and cancelled sessions show "This vote has ended";
 * someone else's session, or a bad id, shows the standard 404.
 *
 * Everything shown comes from `GET /api/decide/[id]`, which already hides the
 * partner's votes (§5.5): this page only ever sees a count of them.
 */
export default function DecideSession({ sessionId }: { sessionId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  // Votes I've cast this round that the last poll may not include yet
  const [localVotes, setLocalVotes] = useState<Record<string, Vote>>({});
  const [index, setIndex] = useState(0);
  const roundSeen = useRef<number | null>(null);
  const [failures, setFailures] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<"next" | "pick" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const api = `/api/decide/${encodeURIComponent(sessionId)}`;

  const inFlight = useRef(false);
  const pending = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const goToLogin = useCallback(() => {
    window.location.assign(
      loginHrefFor(`/decide/${encodeURIComponent(sessionId)}`),
    );
  }, [sessionId]);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      // Never overlap polls, but don't drop this request: run once more after
      pending.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        pending.current = false;
        const controller = new AbortController();
        abort.current = controller;
        await fetchOnce(controller);
        if (controller.signal.aborted) break; // unmounted
      } while (pending.current);
    } finally {
      inFlight.current = false;
    }

    async function fetchOnce(controller: AbortController) {
      try {
        const res = await fetch(api, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.status === 401) {
          goToLogin();
          return;
        }
        if (res.status === 404) {
          setLoad({ kind: "not-found" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as DecideSessionView;
        setFailures(0);
        if (roundSeen.current !== data.round) {
          // First load or a new round: start at the first card I haven't voted on
          roundSeen.current = data.round;
          setLocalVotes({});
          setActionError(null);
          setIndex(firstUnvotedIndex(data.candidates, data.myVotes));
        }
        setLoad({ kind: "ready", data });
      } catch {
        if (controller.signal.aborted) return; // unmounted
        // Polling errors are silent (§5.3); after a few, "Reconnecting…" shows.
        setFailures((n) => n + 1);
        setLoad((prev) => (prev.kind === "loading" ? { kind: "error" } : prev));
      }
    }
  }, [api, goToLogin]);

  useEffect(() => {
    // Initial load; the poll below keeps it fresh.
    void refresh();
    return () => abort.current?.abort();
  }, [refresh]);

  // A toast clears itself after a few seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const data = load.kind === "ready" ? load.data : null;
  const myVotes = useMemo<Record<string, Vote>>(
    () => (data ? { ...data.myVotes, ...localVotes } : {}),
    [data, localVotes],
  );
  const candidates = useMemo(() => data?.candidates ?? [], [data]);

  let screen: Screen | null = null;
  if (data) {
    screen =
      data.status === "OPEN" && candidates.length > 0
        ? index < candidates.length
          ? "vote"
          : "wait"
        : screenFor({ ...data, myVotes });
  }

  // Final screens don't need a leftover toast
  useEffect(() => {
    if (screen === "ended" || screen === "reveal" || screen === "no-match") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToast(null);
    }
  }, [screen]);

  // Poll: every 3 s while waiting, slower while voting, never on final screens
  useEffect(() => {
    const ms = screen ? pollInterval(screen) : null;
    if (!ms) return;
    // Hidden tabs skip ticks; the visibilitychange handler catches up on return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, ms);
    const onVisible = () =>
      document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [screen, refresh]);

  const current = screen === "vote" ? candidates[index] : undefined;

  const castVote = useCallback(
    async (vote: Vote) => {
      if (!current || saving) return;
      setSaving(true);
      try {
        for (let attempt = 1; attempt <= VOTE_ATTEMPTS; attempt++) {
          let res: Response | null;
          try {
            res = await fetch(`${api}/votes`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ candidateId: current.id, vote }),
            });
          } catch {
            res = null; // network failure: no response, but retryable
          }
          if (res?.ok) {
            const body = (await res.json().catch(() => ({}))) as {
              status?: string;
            };
            const next = { ...myVotes, [current.id]: vote };
            setLocalVotes((v) => ({ ...v, [current.id]: vote }));
            setIndex(nextUnvotedIndex(candidates, next, index));
            setToast(null);
            if (body.status && body.status !== "OPEN") void refresh(); // the round just resolved
            return;
          }
          if (res && res.status === 401) {
            goToLogin();
            return;
          }
          if (res && res.status === 404) {
            setLoad({ kind: "not-found" });
            return;
          }
          if (res && (res.status === 409 || res.status === 400)) {
            // The vote ended or the round moved on: show what's there now
            setToast((await readError(res)) ?? "Couldn't save that vote");
            void refresh();
            return;
          }
          if (res && !isRetryableStatus(res.status)) {
            // Any other 4xx will fail the same way again
            setToast((await readError(res)) ?? "Couldn't save that vote");
            return;
          }
          if (attempt < VOTE_ATTEMPTS) {
            setToast("Couldn't save, retrying…");
            await sleep(1000 * attempt);
          }
        }
        setToast(
          "Couldn't save your vote. Check your connection and try again.",
        );
      } finally {
        setSaving(false);
      }
    },
    [api, candidates, current, goToLogin, index, myVotes, refresh, saving],
  );

  // ← No, → Yes, ↑ Really want (§5.3)
  useEffect(() => {
    if (screen !== "vote") return;
    function onKey(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable], [role=dialog]",
        )
      )
        return;
      const vote = voteForKey(e.key);
      if (vote === null) return;
      e.preventDefault();
      void castVote(vote);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, castVote]);

  async function roundAction(kind: "next" | "pick") {
    setBusy(kind);
    setActionError(null);
    try {
      const res = await fetch(
        `${api}/${kind === "next" ? "next-round" : "pick"}`,
        { method: "POST" },
      );
      if (res.status === 401) return goToLogin();
      if (res.status === 404) return setLoad({ kind: "not-found" });
      // 409 often means the partner got there first; the refresh then shows their choice
      if (!res.ok)
        setActionError(
          res.status === 409
            ? ((await readError(res)) ?? "Couldn't do that.")
            : "Couldn't do that. Try again.",
        );
      await refresh();
    } catch {
      setActionError("Couldn't do that. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function endVote() {
    if (!window.confirm("End this vote for both of you?")) return;
    try {
      const res = await fetch(api, { method: "DELETE" });
      if (res.status === 401) return goToLogin();
      if (!res.ok) setToast("Couldn't end the vote. Try again.");
    } catch {
      setToast("Couldn't end the vote. Check your connection and try again.");
    } finally {
      await refresh();
    }
  }

  if (load.kind === "not-found") return <MainNotFound />;

  const partner = partnerLabel(data?.partner.name);
  const partnerHref = data
    ? whatToWatchWithHref(data.partner.id)
    : "/profile";
  const reconnecting = failures >= RECONNECT_AFTER_FAILURES;
  const active = screen === "vote" || screen === "wait";

  return (
    <div className="mx-auto max-w-2xl px-4 py-2 sm:py-8">
      {data && (
        <header className="mb-4 sm:mb-6">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={partnerHref}
              className="flex min-h-11 items-center text-meta text-muted hover:text-text"
            >
              ← Back
            </Link>
            {active && (
              <button
                type="button"
                onClick={endVote}
                className="min-h-11 cursor-pointer text-meta text-muted hover:text-text"
              >
                End vote
              </button>
            )}
          </div>
          <p className="text-center text-meta text-muted">
            Deciding with {partner}
            {data.maxRound > 1 &&
            (screen === "vote" || screen === "wait" || screen === "no-match")
              ? ` · Round ${data.round} of ${data.maxRound}`
              : ""}
          </p>
        </header>
      )}

      {load.kind === "loading" && <CardSkeleton />}
      {load.kind === "error" && (
        <ErrorState
          message="We couldn't load this vote. Check your connection and try again."
          onRetry={() => {
            setLoad({ kind: "loading" });
            void refresh();
          }}
        />
      )}

      {data && screen === "vote" && current && (
        <>
          <VoteCard
            key={current.id}
            candidate={current}
            position={index + 1}
            total={candidates.length}
            currentVote={myVotes[current.id]}
            saving={saving}
            onVote={(v) => void castVote(v)}
          />
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0 || saving}
              className="min-h-11 cursor-pointer px-4 text-meta text-muted hover:text-text disabled:invisible"
            >
              ↶ Undo
            </button>
          </div>
        </>
      )}
      {data && screen === "wait" && (
        <WaitScreen
          partner={partner}
          progress={data.partnerProgress}
          reconnecting={reconnecting}
          onUndo={() => setIndex(candidates.length - 1)}
        />
      )}
      {data && screen === "reveal" && data.result && (
        <RevealScreen
          result={data.result}
          partner={partner}
          doneHref={partnerHref}
        />
      )}
      {data && screen === "no-match" && (
        <NoMatchScreen
          canTryMore={data.round < data.maxRound}
          busy={busy}
          error={actionError}
          reconnecting={reconnecting}
          onTryMore={() => void roundAction("next")}
          onPick={() => void roundAction("pick")}
        />
      )}
      {data && screen === "ended" && <EndedScreen startHref={partnerHref} />}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-sm rounded-control border border-border bg-surface px-4 py-3 text-center text-meta text-text shadow-pop lg:bottom-6"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
