"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MoodControls from "@/components/mood/MoodControls";
import { DEFAULT_SELECTION, type MoodSelection } from "@/lib/moodPicker";
import { partnerLabel } from "@/lib/decideView";
import {
  BANNER_POLL_MS,
  bannerCopy,
  decideHref,
  parseActiveSession,
  startDecideRequest,
  startErrorMessage,
  type ActiveSession,
} from "@/lib/decideEntry";

/**
 * The open vote with this friend, if any (`GET /api/decide?partnerId=`). Polled
 * while the tab is visible; a failed poll keeps the last answer (no banner flicker).
 */
function useActiveSession(partnerId: string): ActiveSession | null {
  const [state, setState] = useState<{ partnerId: string; session: ActiveSession | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const check = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/decide?partnerId=${encodeURIComponent(partnerId)}`, { signal: controller.signal });
        if (cancelled) return;
        // 404 = not connected (any more): nothing to join
        if (res.status === 404) return setState({ partnerId, session: null });
        if (!res.ok) return;
        setState({ partnerId, session: parseActiveSession(await res.json()) });
      } catch {
        // keep the last answer
      }
    };
    check();
    const timer = setInterval(check, BANNER_POLL_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [partnerId]);

  return state?.partnerId === partnerId ? state.session : null;
}

/** "Sam started a vote — Join" (or "Resume" for the starter). Renders nothing when there's no open vote. */
export function JoinBanner({
  partnerId,
  partnerName,
  compact = false,
}: {
  partnerId: string;
  partnerName: string | null | undefined;
  /** Smaller, for a row in the Friends list */
  compact?: boolean;
}) {
  const session = useActiveSession(partnerId);
  if (!session) return null;
  const { text, action } = bannerCopy(session, partnerName);
  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 rounded-lg border ${compact ? "px-3 py-2 mt-2 text-xs" : "px-4 py-3 mb-6 text-sm"}`}
      style={{ borderColor: "var(--accent)", backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
    >
      <span>{text}</span>
      <Link
        href={decideHref(session.id)}
        className="shrink-0 inline-flex items-center justify-center min-h-11 sm:min-h-9 px-4 rounded-md text-white font-medium hover:opacity-90"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {action}
      </Link>
    </div>
  );
}

/** The page's one primary button. Opens a bottom sheet with the mood controls; Start creates the vote and opens it. */
export function DecideTogetherButton({ partnerId, partnerName }: { partnerId: string; partnerName: string | null }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        className="min-h-11 sm:min-h-9 px-5 py-2 text-sm font-medium text-white rounded-md cursor-pointer transition-opacity hover:opacity-90"
        style={{ backgroundColor: "var(--accent)" }}
      >
        Decide together
      </button>
      {open && (
        <StartSheet
          partnerId={partnerId}
          partnerName={partnerName}
          onClose={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
        />
      )}
    </>
  );
}

function StartSheet({ partnerId, partnerName, onClose }: { partnerId: string; partnerName: string | null; onClose: () => void }) {
  const router = useRouter();
  const [mood, setMood] = useState<MoodSelection>(DEFAULT_SELECTION);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const name = partnerLabel(partnerName);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !starting) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, starting]);

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startDecideRequest(partnerId, mood)),
      });
      if (!res.ok) {
        setError(startErrorMessage(res.status));
        setStarting(false);
        return;
      }
      const { id } = (await res.json()) as { id?: unknown };
      if (typeof id !== "string" || !id) throw new Error("no id");
      router.push(decideHref(id));
    } catch {
      setError(startErrorMessage(0));
      setStarting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={() => !starting && onClose()}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="decide-sheet-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-lg max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-xl p-6 shadow-xl outline-none"
        style={{ backgroundColor: "var(--card-bg)" }}
      >
        <h2 id="decide-sheet-title" className="text-xl font-bold mb-1" style={{ color: "var(--primary)" }}>
          Decide together with {name}
        </h2>
        <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
          You each vote privately on the same shortlist, then see what you both picked. Pick a mood, or leave it open.
        </p>
        <MoodControls hideMedia value={mood} onChange={setMood} servicesLabel="On our services" />
        {error && (
          <p role="alert" className="text-sm mt-2" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={starting}
            className="min-h-11 sm:min-h-9 px-4 py-2 text-sm rounded-md border cursor-pointer disabled:opacity-50"
            style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            Cancel
          </button>
          <button
            onClick={start}
            disabled={starting}
            className="min-h-11 sm:min-h-9 px-5 py-2 text-sm font-medium text-white rounded-md cursor-pointer disabled:opacity-60 disabled:cursor-wait"
            style={{ backgroundColor: "var(--accent)" }}
          >
            {starting ? "Building the shortlist…" : "Start"}
          </button>
        </div>
      </div>
    </div>
  );
}
