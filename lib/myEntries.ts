/**
 * Client helper: my movie and TV watchlist rows in one map, for pages that show
 * "Add" vs "Update" on a card and open the Add modals with the existing entry.
 */

/** One of my watchlist rows, movie or TV, as the Add modals take it. */
export interface MyEntry {
  id: string;
  status: string;
  platform?: string | null;
  watchType?: string | null;
  rating?: number | null;
  review?: string | null;
  currentSeason?: number | null;
  currentEpisode?: number | null;
}

/** My movie and TV entries, keyed `movie-123` / `tv-456`. */
export async function loadMyEntries(): Promise<Record<string, MyEntry> | null> {
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
