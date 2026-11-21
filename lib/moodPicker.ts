// "What to watch next" mood picker — pure logic, no network or database.
//
// moodToDiscoverParams turns the user's picks into TMDB /discover query params;
// pickRecommendations chooses a handful from the resulting pool (watchlist first,
// already-watched excluded). Both are deliberately framework-free so they can be
// unit-tested and reused (e.g. by Watch Together to settle a debate between two
// users' pools).

import { providerTierIds } from "./providers";

export type MediaType = "movie" | "tv";
export type MediaChoice = MediaType | "both";
export type Vibe = "any" | "light" | "intense";

export interface MoodSelection {
  vibe: Vibe;
  /** Movies under ~100 min, TV episodes ~30 min or less */
  short: boolean;
  /** Released in roughly the last year */
  fresh: boolean;
  /** Only titles streaming on the user's saved services */
  onMyServices: boolean;
  media: MediaChoice;
}

export const DEFAULT_SELECTION: MoodSelection = {
  vibe: "any",
  short: false,
  fresh: false,
  onMyServices: false,
  media: "both",
};

// TMDB genre IDs differ between movies and TV (e.g. TV has no "Thriller" or
// "Horror", and merges Action & Adventure / Sci-Fi & Fantasy).
const GENRES = {
  movie: {
    light: [35, 16, 10751, 10749, 10402], // Comedy, Animation, Family, Romance, Music
    intense: [53, 28, 27, 80, 10752, 9648], // Thriller, Action, Horror, Crime, War, Mystery
    heavy: [27, 10752], // Horror, War — kept out of "light"
    soft: [10751, 16], // Family, Animation — kept out of "intense"
  },
  tv: {
    light: [35, 16, 10751], // Comedy, Animation, Family
    intense: [80, 10759, 9648, 10768, 10765], // Crime, Action & Adventure, Mystery, War & Politics, Sci-Fi & Fantasy
    heavy: [80, 10768], // Crime, War & Politics
    soft: [10751, 16, 10762], // Family, Animation, Kids
  },
} as const;

// Kids, News, Reality, Soap, Talk — daily shows otherwise crowd out scripted series
// (same exclusion as getNewOnStreamingTV in lib/tmdb.ts).
const TV_ALWAYS_EXCLUDED = [10762, 10763, 10764, 10766, 10767];

export const SHORT_MOVIE_MAX_MINUTES = 100;
export const SHORT_EPISODE_MAX_MINUTES = 30;
export const FRESH_WINDOW_DAYS = 365;

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBefore(today: Date, days: number): string {
  return isoDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));
}

export interface DiscoverContext {
  /** Injected so tests are deterministic */
  today: Date;
  /** User's saved (canonical) streaming service IDs */
  providerIds: number[];
  region?: string;
}

/**
 * Map a mood selection to TMDB discover query params for one media type.
 * Returns a plain string map; the caller adds api_key and page.
 */
export function moodToDiscoverParams(
  selection: MoodSelection,
  media: MediaType,
  ctx: DiscoverContext
): Record<string, string> {
  const genres = GENRES[media];
  const params: Record<string, string> = {
    sort_by: "popularity.desc",
    "vote_average.gte": "6.5",
    // Recent titles haven't had time to collect votes, so the floor drops for them
    "vote_count.gte": selection.fresh ? "50" : media === "movie" ? "300" : "150",
  };

  const without = new Set<number>(media === "tv" ? TV_ALWAYS_EXCLUDED : []);

  if (selection.vibe === "light") {
    params.with_genres = genres.light.join("|"); // "|" = any of
    genres.heavy.forEach((g) => without.add(g));
  } else if (selection.vibe === "intense") {
    params.with_genres = genres.intense.join("|");
    genres.soft.forEach((g) => without.add(g));
    // Comedy-thrillers exist, but "intense" shouldn't lead with sitcoms
    without.add(35);
  }

  if (without.size > 0) params.without_genres = [...without].join(",");

  if (selection.short) {
    params["with_runtime.gte"] = media === "movie" ? "60" : "10"; // skip shorts/clips
    params["with_runtime.lte"] = String(
      media === "movie" ? SHORT_MOVIE_MAX_MINUTES : SHORT_EPISODE_MAX_MINUTES
    );
  }

  if (selection.fresh) {
    const field = media === "movie" ? "primary_release_date" : "first_air_date";
    params[`${field}.gte`] = daysBefore(ctx.today, FRESH_WINDOW_DAYS);
    params[`${field}.lte`] = isoDate(ctx.today);
  }

  if (selection.onMyServices && ctx.providerIds.length > 0) {
    const ids = [...new Set(ctx.providerIds.flatMap(providerTierIds))];
    params.with_watch_providers = ids.join("|");
    params.watch_region = ctx.region ?? "US";
    params.with_watch_monetization_types = "flatrate";
  }

  return params;
}

export function mediaTypesFor(choice: MediaChoice): MediaType[] {
  return choice === "both" ? ["movie", "tv"] : [choice];
}

/** Parse ?vibe=&short=&fresh=&services=&media= from a URL, ignoring junk values. */
export function parseMoodSelection(params: URLSearchParams): MoodSelection {
  const vibe = params.get("vibe");
  const media = params.get("media");
  const flag = (k: string) => params.get(k) === "1";
  return {
    vibe: vibe === "light" || vibe === "intense" ? vibe : "any",
    short: flag("short"),
    fresh: flag("fresh"),
    onMyServices: flag("services"),
    media: media === "movie" || media === "tv" ? media : "both",
  };
}

export function moodSelectionToQuery(s: MoodSelection): string {
  const q = new URLSearchParams({ vibe: s.vibe, media: s.media });
  if (s.short) q.set("short", "1");
  if (s.fresh) q.set("fresh", "1");
  if (s.onMyServices) q.set("services", "1");
  return q.toString();
}

// ── Picking ──────────────────────────────────────────────────────────────────

export interface MoodCandidate {
  id: number;
  mediaType: MediaType;
  title: string;
  posterPath: string | null;
  date: string;
  overview: string;
  popularity: number;
  voteAverage: number;
}

export interface MoodPick extends MoodCandidate {
  onWatchlist: boolean;
}

export const candidateKey = (c: { id: number; mediaType: MediaType }) => `${c.mediaType}-${c.id}`;

export interface PickOptions {
  /** Keys (candidateKey) of titles on the user's want-to-watch list */
  watchlist: Set<string>;
  /** Keys of titles already watched / not interested — never shown */
  exclude: Set<string>;
  /** Keys currently on screen; a shuffle avoids repeating them when it can */
  avoid?: Set<string>;
  count?: number;
  /** Injected so tests are deterministic; defaults to Math.random */
  random?: () => number;
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Choose `count` titles from a candidate pool: drop excluded and duplicate titles,
 * put watchlist matches first, and prefer titles not currently shown. Randomised
 * so "Shuffle" gives a fresh set each time.
 */
export function pickRecommendations(pool: MoodCandidate[], opts: PickOptions): MoodPick[] {
  const { watchlist, exclude, avoid = new Set<string>(), count = 5, random = Math.random } = opts;

  const seen = new Set<string>();
  const eligible: MoodCandidate[] = [];
  for (const c of pool) {
    const key = candidateKey(c);
    if (seen.has(key) || exclude.has(key) || !c.posterPath) continue;
    seen.add(key);
    eligible.push(c);
  }

  // Tiers, best first: fresh watchlist → fresh other → repeat watchlist → repeat other.
  // Within a tier, order is random.
  const tier = (c: MoodCandidate) => {
    const key = candidateKey(c);
    return (avoid.has(key) ? 2 : 0) + (watchlist.has(key) ? 0 : 1);
  };
  const buckets: MoodCandidate[][] = [[], [], [], []];
  for (const c of eligible) buckets[tier(c)].push(c);

  return buckets
    .flatMap((b) => shuffled(b, random))
    .slice(0, count)
    .map((c) => ({ ...c, onWatchlist: watchlist.has(candidateKey(c)) }));
}

// ── Matching a known title against the same filters ──────────────────────────

export interface TitleFacts {
  genreIds: number[];
  /** Movie runtime or typical episode length, in minutes; null if TMDB doesn't know */
  runtime: number | null;
  /** Release / first-air date, YYYY-MM-DD */
  date: string | null;
  voteAverage: number;
  /** Subscription ("flatrate") providers in the watch region */
  providerIds: number[];
}

/**
 * Does a title satisfy discover params built by moodToDiscoverParams? Used for the
 * user's watchlist, which TMDB discover can't filter by ID. Interpreting the params
 * (rather than re-deriving from the selection) keeps one source of truth for what
 * each mood means. vote_count is ignored — the user already chose these titles.
 */
export function matchesDiscoverParams(params: Record<string, string>, t: TitleFacts): boolean {
  const ids = (v: string | undefined, sep: string) => (v ? v.split(sep).map(Number) : []);

  const anyGenre = ids(params.with_genres, "|");
  if (anyGenre.length > 0 && !anyGenre.some((g) => t.genreIds.includes(g))) return false;
  if (ids(params.without_genres, ",").some((g) => t.genreIds.includes(g))) return false;

  const minVote = Number(params["vote_average.gte"] ?? 0);
  if (t.voteAverage > 0 && t.voteAverage < minVote) return false;

  const rtMin = params["with_runtime.gte"];
  const rtMax = params["with_runtime.lte"];
  if (rtMin || rtMax) {
    if (t.runtime == null) return false;
    if (rtMin && t.runtime < Number(rtMin)) return false;
    if (rtMax && t.runtime > Number(rtMax)) return false;
  }

  const dateFrom = params["primary_release_date.gte"] ?? params["first_air_date.gte"];
  const dateTo = params["primary_release_date.lte"] ?? params["first_air_date.lte"];
  if (dateFrom || dateTo) {
    if (!t.date) return false;
    if (dateFrom && t.date < dateFrom) return false; // ISO dates compare as strings
    if (dateTo && t.date > dateTo) return false;
  }

  const providers = ids(params.with_watch_providers, "|");
  if (providers.length > 0 && !providers.some((p) => t.providerIds.includes(p))) return false;

  return true;
}
