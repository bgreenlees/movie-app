"use client";

import Link from "next/link";
import type { WatchFriend } from "@/lib/watchWith";

/**
 * "Watch together" control for What to Watch: a dropdown of accepted friends,
 * with "Just me" first. With no friends it's a short link to add one.
 * `friends` is null while they load.
 */
export default function WatchWithPicker({
  friends,
  value,
  onChange,
}: {
  friends: readonly WatchFriend[] | null;
  /** The selected friend's id, or null for "Just me" */
  value: string | null;
  onChange: (friendId: string | null) => void;
}) {
  if (friends === null) return null;
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
