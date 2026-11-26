"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import Link from "next/link";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import AddTVModal from "@/components/tv/AddTVModal";
import PairCard, { PAIR_GRID, type PairCardTitle } from "@/components/watch-together/PairCard";
import TonightForYouBoth from "@/components/watch-together/TonightForYouBoth";
import type { ShelfItem } from "@/lib/watchTogetherShelves";

interface WatchTogetherData {
  friend: { id: string; name: string | null };
  bothWantToWatch: ShelfItem[];
  friendLovedForMe: ShelfItem[];
  iLovedForFriend: ShelfItem[];
  freshPicks: ShelfItem[];
}

/** One of my watchlist rows, movie or TV, as the Add modals take it. */
interface MyEntry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

const keyOf = (t: { mediaType: "movie" | "tv"; id: number }) => `${t.mediaType}-${t.id}`;

/** My movie and TV entries, keyed `movie-123` / `tv-456`. */
async function loadMyEntries(): Promise<Record<string, MyEntry> | null> {
  try {
    const [want, watched, notInterested, tv] = await Promise.all([
      fetch("/api/watchlist?status=WANT_TO_WATCH"),
      fetch("/api/watchlist?status=WATCHED"),
      fetch("/api/watchlist?status=NOT_INTERESTED"),
      fetch("/api/tv/watchlist"),
    ]);
    if (![want, watched, notInterested, tv].every((r) => r.ok)) return null;
    const [w, wd, ni, t] = await Promise.all([want.json(), watched.json(), notInterested.json(), tv.json()]);
    const entries: Record<string, MyEntry> = {};
    for (const e of [...(w.entries ?? []), ...(wd.entries ?? []), ...(ni.entries ?? [])] as (MyEntry & { movieId: number })[]) {
      entries[`movie-${e.movieId}`] = e;
    }
    for (const e of (t.entries ?? []) as (MyEntry & { tvShowId: number })[]) {
      entries[`tv-${e.tvShowId}`] = e;
    }
    return entries;
  } catch {
    return null;
  }
}

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
            <PairCard
              item={item}
              hasEntry={hasEntry(item)}
              onAdd={() => onAdd(item)}
              onTrailer={() => onTrailer(item)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function WatchTogetherPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const [data, setData] = useState<WatchTogetherData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [entries, setEntries] = useState<Record<string, MyEntry>>({});
  const [adding, setAdding] = useState<PairCardTitle | null>(null);
  const [trailer, setTrailer] = useState<PairCardTitle | null>(null);

  useEffect(() => {
    // Ignore responses that arrive after userId changed or the page unmounted.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/watch-together/${encodeURIComponent(userId)}`);
        if (cancelled) return;
        if (res.status === 404) return setStatus("notFound");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const loaded: WatchTogetherData = await res.json();
        if (cancelled) return;
        setData(loaded);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    loadMyEntries().then((e) => {
      if (!cancelled && e) setEntries(e);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, attempt]);

  const refreshEntries = useCallback(async () => {
    const e = await loadMyEntries();
    if (e) setEntries(e);
  }, []);

  const hasEntry = useCallback((t: { id: number; mediaType: "movie" | "tv" }) => !!entries[keyOf(t)], [entries]);

  // Titles I've since watched, started or ruled out drop out of "Tonight"
  const hidden = useMemo(
    () => new Set(Object.entries(entries).filter(([, e]) => e.status !== "WANT_TO_WATCH").map(([k]) => k)),
    [entries]
  );

  if (status === "loading") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 sm:p-6">
        <p style={{ color: "var(--text-muted)" }}>Loading…</p>
      </div>
    );
  }

  if (status === "notFound") {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--primary)" }}>
          Not connected
        </h1>
        <p className="mb-6" style={{ color: "var(--text-muted)" }}>
          You can only watch together with friends who&apos;ve accepted your request.
        </p>
        <Link href="/profile" className="underline" style={{ color: "var(--accent)" }}>
          Go to Friends in Profile
        </Link>
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div role="alert" className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="mb-4" style={{ color: "var(--text-muted)" }}>
          Couldn&apos;t load Watch Together.
        </p>
        <button
          onClick={() => {
            setStatus("loading");
            setAttempt((n) => n + 1);
          }}
          className="min-h-11 px-4 py-1.5 text-sm rounded-md cursor-pointer hover:opacity-80"
          style={{ color: "var(--accent)", border: "1px solid var(--accent)" }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Never an email (spec §7): the API doesn't return one
  const friendName = data.friend.name?.trim() || "your friend";
  const shelvesEmpty =
    data.bothWantToWatch.length === 0 &&
    data.friendLovedForMe.length === 0 &&
    data.iLovedForFriend.length === 0 &&
    data.freshPicks.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        Watch Together
      </h1>
      <p className="text-base mb-8" style={{ color: "var(--text-muted)" }}>
        with <span style={{ color: "var(--foreground)" }}>{friendName}</span>
      </p>

      <TonightForYouBoth
        partnerId={data.friend.id}
        partnerName={friendName}
        hasEntry={hasEntry}
        hidden={hidden}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />

      <Shelf
        title="Both Want to Watch"
        subtitle="Movies and shows on both your lists"
        items={data.bothWantToWatch}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />
      <Shelf
        title={`${friendName} Loved — You Haven't Seen`}
        subtitle={`${friendName}'s top-rated titles that aren't on your lists yet`}
        items={data.friendLovedForMe}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />
      <Shelf
        title={`You Loved — ${friendName} Hasn't Seen`}
        subtitle={`Your top-rated titles that ${friendName} hasn't added yet`}
        items={data.iLovedForFriend}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />
      <Shelf
        title="Fresh Picks for Both of You"
        subtitle="Recommended from titles you both liked"
        items={data.freshPicks}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />

      {shelvesEmpty && (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
          Rate some movies and shows, and ask {friendName} to do the same, to fill in more shelves here.
        </p>
      )}

      <TrailerModal
        movieId={trailer?.id ?? null}
        movieTitle={trailer?.title ?? ""}
        mediaType={trailer?.mediaType}
        onClose={() => setTrailer(null)}
      />

      {adding?.mediaType === "movie" && (
        <AddMovieModal
          isOpen
          onClose={() => setAdding(null)}
          movieId={adding.id}
          movieTitle={adding.title}
          existingEntry={entries[keyOf(adding)]}
          onSuccess={() => {
            setAdding(null);
            refreshEntries();
          }}
        />
      )}
      {adding?.mediaType === "tv" && (
        <AddTVModal
          isOpen
          onClose={() => setAdding(null)}
          tvShowId={adding.id}
          tvShowName={adding.title}
          existingEntry={entries[keyOf(adding)]}
          onSuccess={() => {
            setAdding(null);
            refreshEntries();
          }}
        />
      )}
    </div>
  );
}
