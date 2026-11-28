"use client";

import { useEffect, useState } from "react";
import PairCard, { PAIR_GRID, type PairCardTitle } from "./PairCard";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import Skeleton from "@/components/ui/Skeleton";
import type { ShelfItem } from "@/lib/watchTogetherShelves";
import type { MediaChoice } from "@/lib/moodPicker";

interface ShelvesData {
  friend: { id: string; name: string | null };
  bothWantToWatch: ShelfItem[];
  friendLovedForMe: ShelfItem[];
  iLovedForFriend: ShelfItem[];
}

const keyOf = (t: { mediaType: "movie" | "tv"; id: number }) => `${t.mediaType}-${t.id}`;

/** Badge under a poster on the "loved or liked" shelves. */
const ratingLabel = (rating?: number) => (rating === 3 ? "♥ Loved" : rating === 2 ? "👍 Liked" : undefined);

function Shelf({
  title,
  subtitle,
  items,
  hasEntry,
  onAdd,
  onTrailer,
}: {
  title: string;
  subtitle: string;
  items: ShelfItem[];
  hasEntry: (t: ShelfItem) => boolean;
  onAdd: (t: PairCardTitle) => void;
  onTrailer: (t: PairCardTitle) => void;
}) {
  // Empty shelves are hidden
  if (items.length === 0) return null;
  return (
    <section className="mb-12">
      <h2 className="text-xl font-bold mb-1" style={{ color: "var(--primary)" }}>
        {title}
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
        {subtitle}
      </p>
      <ul className={PAIR_GRID}>
        {items.map((item) => (
          <li key={keyOf(item)}>
            <PairCard item={item} caption={ratingLabel(item.rating)} hasEntry={hasEntry(item)} onAdd={() => onAdd(item)} onTrailer={() => onTrailer(item)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The three Watch Together shelves (both want to watch, what each of you loved
 * that aren't on the other's lists), from `GET /api/watch-together/[userId]`. They
 * are lists, so they ignore the mood controls but follow the Both/Movies/TV
 * filter. Keyed on the friend by the caller, so one friend's shelves never
 * show under another.
 */
export default function WatchTogetherShelves({
  partnerId,
  partnerName,
  media,
  hasEntry,
  onAdd,
  onTrailer,
}: {
  partnerId: string;
  partnerName: string | null;
  media: MediaChoice;
  hasEntry: (t: { id: number; mediaType: "movie" | "tv" }) => boolean;
  onAdd: (t: PairCardTitle) => void;
  onTrailer: (t: PairCardTitle) => void;
}) {
  const [data, setData] = useState<ShelvesData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/watch-together/${encodeURIComponent(partnerId)}`);
        if (cancelled) return;
        // 404 (no longer connected): the picks area handles that and returns to "Just me"
        if (res.status === 404) return;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const loaded: ShelvesData = await res.json();
        if (cancelled) return;
        setData(loaded);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [partnerId, attempt]);

  // Never an email: the API doesn't return one
  const name = partnerName?.trim() || data?.friend.name?.trim() || "your friend";
  const show = (items: ShelfItem[]) => (media === "both" ? items : items.filter((i) => i.mediaType === media));

  if (status === "error") {
    return (
      <div className="mt-10">
        <ErrorState
          title="Couldn't load the shelves"
          onRetry={() => {
            setStatus("loading");
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }
  if (!data) return <div className="mt-10"><Skeleton count={6} label="Loading shelves" /></div>;

  const both = show(data.bothWantToWatch);
  const theirs = show(data.friendLovedForMe);
  const mine = show(data.iLovedForFriend);

  return (
    <div className="mt-10">
      <Shelf
        title="Both Want to Watch"
        subtitle="Movies and shows on both your lists"
        items={both}
        hasEntry={hasEntry}
        onAdd={onAdd}
        onTrailer={onTrailer}
      />
      <Shelf
        title={`${name} Loved or Liked — Not on Your Lists`}
        subtitle={`Titles ${name} rated ♥ or 👍 that aren't on your lists yet, loves first`}
        items={theirs}
        hasEntry={hasEntry}
        onAdd={onAdd}
        onTrailer={onTrailer}
      />
      <Shelf
        title={`You Loved or Liked — Not on ${name}'s Lists`}
        subtitle={`Titles you rated ♥ or 👍 that aren't on ${name}'s lists yet, loves first`}
        items={mine}
        hasEntry={hasEntry}
        onAdd={onAdd}
        onTrailer={onTrailer}
      />
      {both.length + theirs.length + mine.length === 0 && (
        <EmptyState
          icon="🍿"
          title="No shelves yet"
          body={`Rate some movies and shows, and ask ${name} to do the same, to fill in more shelves here.`}
        />
      )}
    </div>
  );
}
