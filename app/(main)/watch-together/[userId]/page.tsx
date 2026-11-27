"use client";

import { useCallback, useEffect, useMemo, useState, use } from "react";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import AddTVModal from "@/components/tv/AddTVModal";
import PairCard, { PAIR_GRID, type PairCardTitle } from "@/components/watch-together/PairCard";
import { DecideTogetherButton, JoinBanner } from "@/components/decide/DecideEntry";
import TonightForYouBoth from "@/components/watch-together/TonightForYouBoth";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
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
  // Keyed on the friend, so one friend's loaded picks and shelves never show on another's page
  return <WatchTogether key={userId} userId={userId} />;
}

function WatchTogether({ userId }: { userId: string }) {
  const [data, setData] = useState<WatchTogetherData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  // The picks route reports a missing connection and the partner's name too; either response can arrive first
  const [picksNotFound, setPicksNotFound] = useState(false);
  const [picksName, setPicksName] = useState<string | null>(null);
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

  if (status === "notFound" || picksNotFound) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20">
        <EmptyState
          icon="🔒"
          title="Not connected"
          body="You can only watch together with friends who've accepted your request."
          action={{ label: "Go to Friends in Profile", href: "/profile" }}
        />
      </div>
    );
  }

  // Never an email (spec §7): the API doesn't return one
  // The name comes from whichever response arrives first; null until one does
  const shelfName = data ? data.friend.name?.trim() || "your friend" : null;
  const friendName = shelfName ?? picksName;
  const nameForCopy = friendName ?? "your friend";
  const shelvesEmpty =
    !!data &&
    data.bothWantToWatch.length === 0 &&
    data.friendLovedForMe.length === 0 &&
    data.iLovedForFriend.length === 0 &&
    data.freshPicks.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:p-6">
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--primary)" }}>
        Watch Together
      </h1>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <p className="text-base" style={{ color: "var(--text-muted)" }}>
          with <span style={{ color: "var(--foreground)" }}>{friendName ?? "…"}</span>
        </p>
        <DecideTogetherButton partnerId={userId} partnerName={friendName} />
      </div>
      <JoinBanner partnerId={userId} partnerName={friendName} />

      <TonightForYouBoth
        partnerId={userId}
        partnerName={friendName}
        onPartnerName={(n) => setPicksName(n ?? "your friend")}
        onNotFound={() => setPicksNotFound(true)}
        hasEntry={hasEntry}
        hidden={hidden}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />

      {status === "loading" && <Skeleton count={5} label="Loading shelves" />}
      {status === "error" && (
        <ErrorState
          title="Couldn't load the shelves"
          onRetry={() => {
            setStatus("loading");
            setAttempt((n) => n + 1);
          }}
        />
      )}
      {data && (
        <>
      <Shelf
        title="Both Want to Watch"
        subtitle="Movies and shows on both your lists"
        items={data.bothWantToWatch}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />
      <Shelf
        title={`${nameForCopy} Loved — You Haven't Seen`}
        subtitle={`${nameForCopy}'s top-rated titles that aren't on your lists yet`}
        items={data.friendLovedForMe}
        hasEntry={hasEntry}
        onAdd={setAdding}
        onTrailer={setTrailer}
      />
      <Shelf
        title={`You Loved — ${nameForCopy} Hasn't Seen`}
        subtitle={`Your top-rated titles that ${nameForCopy} hasn't added yet`}
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

        </>
      )}

      {shelvesEmpty && (
        <EmptyState
          icon="🍿"
          title="No shelves yet"
          body={`Rate some movies and shows, and ask ${nameForCopy} to do the same, to fill in more shelves here.`}
        />
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
