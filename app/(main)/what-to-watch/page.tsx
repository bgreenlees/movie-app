"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Skeleton from "@/components/ui/Skeleton";
import EmptyState from "@/components/ui/EmptyState";
import ErrorState from "@/components/ui/ErrorState";
import toast from "react-hot-toast";
import PosterCard, { POSTER_GRID } from "@/components/ui/PosterCard";
import AddMovieModal from "@/components/movies/AddMovieModal";
import TrailerModal from "@/components/movies/TrailerModal";
import MoodControls, { MediaControl } from "@/components/mood/MoodControls";
import { isOnList, yearMeta } from "@/lib/posterCard";
import AddTVModal from "@/components/tv/AddTVModal";
import { DecideEntry } from "@/components/decide/DecideEntry";
import TonightForYouBoth, { type TonightMeta } from "@/components/watch-together/TonightForYouBoth";
import WatchWithPicker from "@/components/watch-together/WatchWithPicker";
import { loadMyEntries, type MyEntry } from "@/lib/myEntries";
import { parseFriends, resolveWith, type WatchFriend } from "@/lib/watchWith";
import {
  DEFAULT_SELECTION,
  candidateKey,
  moodSelectionToQuery,
  parseMoodSelection,
  pickRecommendations,
  refreshPicks,
  type MoodCandidate,
  type MoodPick,
  type MoodSelection,
} from "@/lib/moodPicker";

interface Entry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

interface PoolData {
  pool: MoodCandidate[];
  watchlist: Record<string, Entry>;
  exclude: string[];
  hasServices: boolean;
}

const PICK_COUNT = 5;

type Selected = { id: number; title: string };

function pick(data: PoolData, selection: MoodSelection, avoid?: MoodPick[]): MoodPick[] {
  return pickRecommendations(data.pool, {
    selection,
    watchlist: new Set(Object.keys(data.watchlist)),
    exclude: new Set(data.exclude),
    avoid: new Set((avoid ?? []).map(candidateKey)),
    count: PICK_COUNT,
  });
}

export default function WhatToWatchPage() {
  // useSearchParams needs a Suspense boundary for the page to prerender
  return (
    <Suspense>
      <WhatToWatch />
    </Suspense>
  );
}

function WhatToWatch() {
  const router = useRouter();
  const pathname = usePathname();
  const withParam = useSearchParams().get("with");
  // Accepted friends (null while loading); a failed load means "Just me" only
  const [friends, setFriends] = useState<WatchFriend[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/connections");
        const list = res.ok ? parseFriends(await res.json()) : [];
        if (!cancelled) setFriends(list);
      } catch {
        if (!cancelled) setFriends([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // An id that isn't an accepted friend quietly means "Just me": same result for unknown and non-friend ids
  const friend = friends ? resolveWith(withParam, friends) : null;
  // A shared link is waiting on the friends list: don't load picks for the wrong mode yet
  const resolving = !!withParam && friends === null;
  const pair = !!friend;
  const solo = !pair && !resolving;

  const setWith = useCallback(
    (id: string | null) => router.replace(id ? `${pathname}?with=${encodeURIComponent(id)}` : pathname, { scroll: false }),
    [router, pathname]
  );
  useEffect(() => {
    if (friends && withParam && !friend) router.replace(pathname, { scroll: false });
  }, [friends, withParam, friend, router, pathname]);

  const [sharedOnly, setSharedOnly] = useState(false);
  const [shuffleKey, setShuffleKey] = useState(0);
  const [tonightMeta, setTonightMeta] = useState<TonightMeta>({ canShuffle: false, bothHaveServices: false });
  // My list entries, for Add vs Update on pair picks
  const [myEntries, setMyEntries] = useState<Record<string, MyEntry>>({});
  const loadEntries = useCallback(async () => {
    const e = await loadMyEntries();
    if (e) setMyEntries(e);
  }, []);
  useEffect(() => {
    if (!pair) return;
    let cancelled = false;
    loadMyEntries().then((e) => {
      if (!cancelled && e) setMyEntries(e);
    });
    return () => {
      cancelled = true;
    };
  }, [pair]);
  // Titles I've since watched or ruled out drop out of the pair picks; a show I'm watching can stay
  const hidden = useMemo(
    () =>
      new Set(
        Object.entries(myEntries)
          .filter(([, e]) => e.status !== "WANT_TO_WATCH" && e.status !== "WATCHING")
          .map(([k]) => k)
      ),
    [myEntries]
  );

  const [selection, setSelection] = useState<MoodSelection>(DEFAULT_SELECTION);
  const query = moodSelectionToQuery(selection);
  // The query the current pool was loaded for; loading is "pool is for an older query"
  const [loaded, setLoaded] = useState<{ query: string; data: PoolData } | null>(null);
  const [picks, setPicks] = useState<MoodPick[]>([]);
  const [reload, setReload] = useState(0);
  // Bumped by Retry so the same query is fetched again
  const [attempt, setAttempt] = useState(0);
  // The query whose load failed, so the page shows an error instead of "Loading…"
  const [failed, setFailed] = useState<string | null>(null);
  const [selectedMovie, setSelectedMovie] = useState<Selected | null>(null);
  const [selectedShow, setSelectedShow] = useState<Selected | null>(null);
  const [trailer, setTrailer] = useState<(Selected & { mediaType: "movie" | "tv" }) | null>(null);

  useEffect(() => {
    if (!solo) return;
    // Aborting stops a stale request (e.g. after quick chip clicks) instead of
    // just ignoring its response. The route sees the abort (req.signal) and skips
    // TMDB lookups still queued; ones already in flight finish.
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`/api/mood-picks?${query}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PoolData = await res.json();
        if (controller.signal.aborted) return;
        setFailed(null);
        setLoaded({ query, data });
        const sel = parseMoodSelection(new URLSearchParams(query));
        // A reload (after Add/Update) keeps the cards, refreshes their flags, and
        // swaps out any just marked watched or not interested
        setPicks((current) =>
          reload > 0
            ? refreshPicks(current, data.pool, {
                selection: sel,
                watchlist: new Set(Object.keys(data.watchlist)),
                exclude: new Set(data.exclude),
                count: PICK_COUNT,
              })
            : pick(data, sel)
        );
      } catch {
        if (controller.signal.aborted) return;
        // A failed refresh after Add/Update keeps the cards that are showing;
        // a failed load for a new selection shows the error with Retry
        if (reload > 0) toast.error("Couldn't refresh suggestions");
        else setFailed(query);
      }
    })();
    return () => controller.abort();
  }, [query, reload, attempt, solo]);

  const hasError = solo && failed === query;
  const isLoading = solo && loaded?.query !== query && !hasError;
  const data = hasError ? undefined : loaded?.data;

  const retry = () => {
    setFailed(null);
    setAttempt((n) => n + 1);
  };

  const update = (next: Partial<MoodSelection>) => {
    setReload(0);
    setSelection((s) => ({ ...s, ...next }));
  };

  const shuffle = () => {
    if (pair) setShuffleKey((n) => n + 1);
    else if (data) setPicks(pick(data, selection, picks));
  };

  // After adding/updating, refresh watchlist info but keep the cards on screen
  const refreshEntries = () => {
    if (pair) loadEntries();
    else setReload((n) => n + 1);
  };

  const watchlistEntry = (p: { id: number; mediaType: "movie" | "tv" }) =>
    pair ? myEntries[candidateKey(p)] : data?.watchlist[candidateKey(p)];

  const addPair = (t: { id: number; title: string; mediaType: "movie" | "tv" }) =>
    (t.mediaType === "movie" ? setSelectedMovie : setSelectedShow)({ id: t.id, title: t.title });

  const friendName = friend?.name ?? null;

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h1 className="text-3xl font-bold" style={{ color: "var(--primary)" }}>
          What to Watch
        </h1>
        <WatchWithPicker friends={friends} value={friend?.id ?? null} onChange={setWith} />
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        {pair
          ? `Movies and shows you and ${friendName} are both likely to enjoy, nothing either of you has seen.`
          : "Pick a mood and we\u2019ll suggest a few titles \u2014 your watchlist first, nothing you\u2019ve already seen."}
      </p>

      <MoodControls
        hideMedia
        value={selection}
        onChange={(next) => update(next)}
        servicesLabel={pair ? "On our services" : undefined}
        showBothHave={pair && tonightMeta.bothHaveServices && selection.onMyServices}
        bothHave={sharedOnly}
        onBothHaveChange={setSharedOnly}
      />

      {solo && selection.onMyServices && data && !data.hasServices && (
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          Save your streaming services in{" "}
          <Link href="/profile" style={{ color: "var(--color-accent-text)" }}>
            Profile
          </Link>{" "}
          to filter by them \u2014 showing everything for now.
        </p>
      )}

      {pair && friend && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
          <DecideEntry partnerId={friend.id} partnerName={friend.name} />
          <Link
            href={`/watch-together/${encodeURIComponent(friend.id)}`}
            className="text-sm underline"
            style={{ color: "var(--accent)" }}
          >
            More with {friend.name}
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-8 mb-4">
        <h2 className="text-lg font-bold" style={{ color: "var(--primary)" }}>
          {pair ? "Up next for you both" : "Up next for you"}
        </h2>
        <div className="flex items-center gap-2">
          <MediaControl value={selection.media} onChange={(media) => update({ media })} />
          <button
            onClick={shuffle}
            disabled={pair ? !tonightMeta.canShuffle : isLoading || hasError || picks.length === 0}
            className="flex items-center gap-1.5 min-h-11 sm:min-h-9 px-4 py-1.5 text-white text-sm rounded-md cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--accent)" }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Shuffle
          </button>
        </div>
      </div>

      {resolving ? (
        <Skeleton count={PICK_COUNT} label="Loading suggestions" />
      ) : pair && friend ? (
        <TonightForYouBoth
          key={friend.id}
          partnerId={friend.id}
          partnerName={friend.name}
          selection={selection}
          sharedOnly={sharedOnly}
          onSelectionChange={update}
          onSharedOnlyChange={setSharedOnly}
          shuffleKey={shuffleKey}
          onMeta={setTonightMeta}
          // The connection is gone (404): back to "Just me", no message
          onNotFound={() => setWith(null)}
          hasEntry={(t) => !!watchlistEntry(t)}
          hidden={hidden}
          onAdd={addPair}
          onTrailer={(t) => setTrailer({ id: t.id, title: t.title, mediaType: t.mediaType })}
        />
      ) : hasError ? (
        <ErrorState title="Couldn't load suggestions" onRetry={retry} />
      ) : isLoading && !data ? (
        <Skeleton count={PICK_COUNT} label="Loading suggestions" />
      ) : picks.length === 0 && !isLoading ? (
        <EmptyState
          icon="🎲"
          title="Nothing matches all of those"
          body="Try turning a mood off to widen the search."
        />
      ) : (
        <div
          className={`${POSTER_GRID} transition-opacity`}
          style={{ opacity: isLoading ? 0.5 : 1 }}
          aria-busy={isLoading}
        >
          {picks.map((p) => {
            const selected = { id: p.id, title: p.title };
            return (
              <PosterCard
                key={candidateKey(p)}
                id={p.id}
                mediaType={p.mediaType}
                title={p.title}
                posterPath={p.posterPath}
                overview={p.overview}
                meta={yearMeta(p.date, p.mediaType)}
                onList={p.onWatchlist || isOnList(watchlistEntry(p)?.status)}
                onAdd={() => (p.mediaType === "movie" ? setSelectedMovie : setSelectedShow)(selected)}
                onTrailer={() => setTrailer({ ...selected, mediaType: p.mediaType })}
              />
            );
          })}
        </div>
      )}

      <TrailerModal
        movieId={trailer?.id ?? null}
        movieTitle={trailer?.title ?? ""}
        mediaType={trailer?.mediaType}
        onClose={() => setTrailer(null)}
      />

      {selectedMovie && (
        <AddMovieModal
          isOpen={!!selectedMovie}
          onClose={() => setSelectedMovie(null)}
          movieId={selectedMovie.id}
          movieTitle={selectedMovie.title}
          existingEntry={watchlistEntry({ id: selectedMovie.id, mediaType: "movie" })}
          onSuccess={() => {
            setSelectedMovie(null);
            refreshEntries();
          }}
        />
      )}

      {selectedShow && (
        <AddTVModal
          isOpen={!!selectedShow}
          onClose={() => setSelectedShow(null)}
          tvShowId={selectedShow.id}
          tvShowName={selectedShow.title}
          existingEntry={watchlistEntry({ id: selectedShow.id, mediaType: "tv" })}
          onSuccess={() => {
            setSelectedShow(null);
            refreshEntries();
          }}
        />
      )}
    </div>
  );
}
