"use client";

import Link from "next/link";
import type { FriendsState } from "@/lib/watchWith";

/**
 * "Watch together" control for What to Watch: a dropdown of accepted friends,
 * with "Just me" first. With no friends it's a short link to add one.
 * If the friends couldn't be loaded it says so with a Retry, rather than
 * pretending there are none.
 */
export default function WatchWithPicker({
  state,
  value,
  onChange,
  onRetry,
}: {
  state: FriendsState;
  /** The selected friend's id, or null for "Just me" */
  value: string | null;
  onChange: (friendId: string | null) => void;
  onRetry: () => void;
}) {
  if (state.status === "loading") return null;
  if (state.status === "error") {
    return (
      <p role="status" className="text-sm" style={{ color: "var(--text-muted)" }}>
        Couldn&apos;t load your friends —{" "}
        <button onClick={onRetry} className="underline cursor-pointer" style={{ color: "var(--accent)" }}>
          Retry
        </button>
      </p>
    );
  }
  const { friends } = state;
  if (friends.length === 0) {
    return (
      <Link href="/profile" className="text-sm underline" style={{ color: "var(--accent)" }}>
        Add a friend in Profile to watch together
      </Link>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
      <span className="shrink-0">Watch together</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="min-h-11 sm:min-h-9 max-w-[12rem] rounded-md border px-3 py-1.5 text-sm cursor-pointer"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
      >
        <option value="">Just me</option>
        {friends.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
