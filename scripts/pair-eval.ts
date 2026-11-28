// Watch Together pair quality check: would BOTH people like what we rank first?
//
// Runs the real pair pool (lib/pairPool.ts, the same code as
// GET /api/watch-together/[userId]/picks) for synthetic persona pairs
// (scripts/fixtures/pair-personas.ts) under several moods, and prints the top 10
// for each with two columns for a person to rate: does A like it, does B?
//
//   npm run eval:pairs                       # tables to stdout
//   npm run eval:pairs -- --json             # raw JSON (to diff between runs)
//   npm run eval:pairs -- --pair similar     # one pair only (ids in the fixtures)
//
// Ratings live in scripts/fixtures/pair-ratings.json, keyed by persona and title
// ("<pair>/<a|b>/<media>-<id>" → "✓" | "~" | "✗"), so a rating is made once and
// reused in every mood. Titles without a rating are left out of the metrics,
// which report how many titles were rated.
//
//   Joint hit rate = share of rated titles where both are ✓ (a title with a ~ and no ✗ counts ½).
//   Misery rate    = share of rated titles where either person is ✗.
//   Movie/TV split = an outcome of the traits, never a target.
//
// Needs TMDB_API_KEY (from .env.local). Calls TMDB only, never the database, and
// uses no real user's data. Not a Vitest test on purpose: it hits the network and
// its output needs human judgement. Spec: docs/specs/watch-together-decide.md §9.1.

import { readFileSync, existsSync } from "node:fs";
import { createLimiter } from "../lib/concurrency";
import { DEFAULT_SELECTION, candidateKey, type MediaType, type MoodCandidate, type MoodSelection } from "../lib/moodPicker";
import { buildPairPool, type FullTitleFacts, type PairCandidate, type PoolEntry, type PoolFetchers } from "../lib/pairPool";
import { PAIRS, type Persona } from "./fixtures/pair-personas";
import { LABELLED_PAIR, LABELS, labelReport, type LabelReport } from "./fixtures/pair-labels";

const API = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
const KEY = process.env.TMDB_API_KEY;
const TOP = 10;
const RATINGS_FILE = new URL("./fixtures/pair-ratings.json", import.meta.url);

const MOODS: Array<{ id: string; name: string; sel: Partial<MoodSelection> }> = [
  { id: "any", name: "Any mood", sel: {} },
  { id: "light", name: "Light", sel: { vibe: "light" } },
  { id: "intense-120", name: "Intense + Under 2 hrs", sel: { vibe: "intense", time: "120" } },
  { id: "30min", name: "~30 min", sel: { time: "30" } },
];

type Mark = "✓" | "~" | "✗";
const MARK_VALUE: Record<Mark, number> = { "✓": 1, "~": 0.5, "✗": 0 };

const limit = createLimiter(6);

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...params, api_key: KEY! });
  for (let attempt = 0; ; attempt++) {
    const res = await limit(() => fetch(`${API}${path}?${q}`));
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
    return res.json() as Promise<T>;
  }
}

type Details = {
  id: number; title?: string; name?: string; poster_path: string | null;
  release_date?: string; first_air_date?: string; overview?: string;
  genres?: { id: number }[]; original_language?: string; runtime?: number; episode_run_time?: number[];
  last_episode_to_air?: { runtime?: number | null } | null;
  popularity?: number; vote_average?: number; vote_count?: number;
  "watch/providers"?: { results?: { US?: { flatrate?: { provider_id: number }[] } } };
};

const detailsCache = new Map<string, Promise<Details>>();
const details = (media: MediaType, id: number) => {
  const k = `${media}-${id}`;
  let p = detailsCache.get(k);
  if (!p) detailsCache.set(k, (p = get<Details>(`/${media}/${id}`, { append_to_response: "watch/providers" })));
  return p;
};

// Same rule as lib/tmdb.ts tvEpisodeRuntime
function runtimeOf(media: MediaType, d: Details): number | null {
  const candidates = media === "movie" ? [d.runtime] : [d.episode_run_time?.[0], d.last_episode_to_air?.runtime];
  for (const r of candidates) if (typeof r === "number" && r > 0) return r;
  return null;
}

// ── Fetchers: the same TMDB calls the route makes, without the Next.js client ──

type Raw = {
  id: number; title?: string; name?: string; poster_path: string | null; release_date?: string;
  first_air_date?: string; overview: string; popularity: number; vote_average: number;
  vote_count: number; genre_ids: number[]; original_language?: string;
};
const toCandidate = (media: MediaType, r: Raw): MoodCandidate => ({
  id: r.id, mediaType: media, title: r.title ?? r.name ?? "?", posterPath: r.poster_path,
  date: (media === "movie" ? r.release_date : r.first_air_date) ?? "", overview: r.overview,
  popularity: r.popularity, voteAverage: r.vote_average, voteCount: r.vote_count, genreIds: r.genre_ids, originalLanguage: r.original_language,
});

const fetchers: PoolFetchers = {
  async facts(media, id): Promise<FullTitleFacts> {
    const d = await details(media, id);
    return {
      id: d.id,
      title: (media === "movie" ? d.title : d.name) ?? "?",
      posterPath: d.poster_path ?? null,
      date: (media === "movie" ? d.release_date : d.first_air_date) ?? "",
      overview: d.overview ?? "",
      popularity: d.popularity ?? 0,
      voteAverage: d.vote_average ?? 0,
      voteCount: d.vote_count ?? 0,
      genreIds: (d.genres ?? []).map((g) => g.id),
      originalLanguage: d.original_language,
      runtime: runtimeOf(media, d),
      providerIds: (d["watch/providers"]?.results?.US?.flatrate ?? []).map((p) => p.provider_id),
    };
  },
  async recommendations(media, id) {
    const d = await get<{ results?: Raw[] }>(`/${media}/${id}/recommendations`);
    return (d.results ?? []).map((r) => toCandidate(media, r));
  },
  async discover(media, params, page) {
    const d = await get<{ results?: Raw[]; total_results: number }>(`/discover/${media}`, { ...params, page: String(page) });
    return { total: d.total_results, candidates: (d.results ?? []).map((r) => toCandidate(media, r)) };
  },
};

// ── Personas → pool people ──

// The pool seeds recommendations from each person's most recently added Loves, so
// the order titles were "added" matters. Fixtures are written grouped by type for
// readability, which would make every seed a series; interleave them (movie, TV,
// movie, TV…, each type keeping its order) so the seeds look like a real mixed history.
function alternateMedia<T extends { media: string }>(titles: T[]): T[] {
  const lists = [titles.filter((x) => x.media === "movie"), titles.filter((x) => x.media === "tv")];
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (l[i]) out.push(l[i]);
  return out;
}

let clock = 0;
async function personEntries(p: Persona): Promise<PoolEntry[]> {
  const out: PoolEntry[] = [];
  for (const x of alternateMedia(p.titles)) {
    const d = await details(x.media, x.id);
    // Earlier in the list = added earlier, so the last Loves are the "most recent" seeds
    out.push({
      mediaType: x.media, tmdbId: x.id,
      status: x.want && x.rating === undefined ? "WANT_TO_WATCH" : "WATCHED",
      rating: x.rating ?? null, addedAt: ++clock,
      title: (x.media === "movie" ? d.title : d.name) ?? x.title,
      posterPath: d.poster_path ?? null,
      date: (x.media === "movie" ? d.release_date : d.first_air_date) ?? null,
      overview: d.overview ?? "", genreIds: (d.genres ?? []).map((g) => g.id),
    });
  }
  return out;
}

// ── Ratings ──

const ratings: Record<string, Mark> = existsSync(RATINGS_FILE) ? JSON.parse(readFileSync(RATINGS_FILE, "utf8")) : {};
const markFor = (pair: string, who: "a" | "b", key: string): Mark | undefined => ratings[`${pair}/${who}/${key}`];

// Repeatable draws, so two runs differ only when the app does (mulberry32)
function seededRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(x: number) { return `${Math.round(x * 100)}%`; }

type Result = {
  pair: string; mood: string; movies: number; tv: number; rated: number;
  hit: number | null; misery: number | null;
  /** Labelled pair only: where the owner's good/bad titles land (pool rank and draw chance) */
  labels?: LabelReport;
  rows: { key: string; title: string; type: string; year: string; genres: string; source: string; a?: Mark; b?: Mark }[];
};

async function main() {
  if (!KEY) throw new Error("TMDB_API_KEY not set. Run via `npm run eval:pairs` so .env.local is loaded.");
  const json = process.argv.includes("--json");
  const only = process.argv.includes("--pair") ? process.argv[process.argv.indexOf("--pair") + 1] : null;
  const pairs = PAIRS.filter((p) => !only || p.id === only);
  if (pairs.length === 0) throw new Error(`No pair "${only}". Ids: ${PAIRS.map((p) => p.id).join(", ")}`);

  const genreNames = new Map<string, string>();
  for (const m of ["movie", "tv"] as const) {
    const { genres } = await get<{ genres: { id: number; name: string }[] }>(`/genre/${m}/list`);
    genres.forEach((g) => genreNames.set(`${m}-${g.id}`, g.name));
  }

  const results: Result[] = [];
  const today = new Date();
  for (const pair of pairs) {
    const [aEntries, bEntries] = await Promise.all([personEntries(pair.a), personEntries(pair.b)]);
    for (const mood of MOODS) {
      const errors: string[] = [];
      const res = await buildPairPool({
        me: { entries: aEntries, providerIds: [] },
        partner: { entries: bEntries, providerIds: [] },
        partnerName: "B",
        selection: { ...DEFAULT_SELECTION, ...mood.sel },
        sharedOnly: false,
        today,
        fetchers,
        onError: (what, e) => errors.push(`${what}: ${String(e).replace(/api_key=[^&\s]+/g, "api_key=***")}`),
      });
      const top: PairCandidate[] = res.pool.slice(0, TOP);
      const rows = top.map((c) => {
        const key = candidateKey(c);
        return {
          key, title: c.title, type: c.mediaType === "movie" ? "Movie" : "TV", year: c.date.slice(0, 4),
          genres: (c.genreIds ?? []).map((g) => genreNames.get(`${c.mediaType}-${g}`) ?? g).join(", "),
          source: c.reason, a: markFor(pair.id, "a", key), b: markFor(pair.id, "b", key),
        };
      });
      const both = rows.filter((r) => r.a && r.b);
      // A title scores the lower of the two people's marks (✓ 1, ~ ½, ✗ 0): both ✓ = 1, any ~ = ½, any ✗ = 0
      const joint = both.length ? both.reduce((s, r) => s + Math.min(MARK_VALUE[r.a!], MARK_VALUE[r.b!]), 0) / both.length : null;
      const misery = both.length ? both.filter((r) => r.a === "✗" || r.b === "✗").length / both.length : null;
      results.push({
        pair: pair.id, mood: mood.id, movies: top.filter((c) => c.mediaType === "movie").length,
        tv: top.filter((c) => c.mediaType === "tv").length, rated: both.length, hit: joint, misery, rows,
        labels: pair.id === LABELLED_PAIR ? labelReport(res.pool, LABELS, seededRandom(42)) : undefined,
      });
      if (errors.length && !json) console.error(`(${pair.id} / ${mood.name}: ${errors.length} TMDB call(s) failed, e.g. ${errors[0]})`);
    }
  }

  if (json) return console.log(JSON.stringify(results, null, 2));

  for (const pair of pairs) {
    console.log(`\n## ${pair.name}\n\n_${pair.checks}_\n`);
    for (const mood of MOODS) {
      const r = results.find((x) => x.pair === pair.id && x.mood === mood.id)!;
      console.log(`### ${mood.name}\n`);
      console.log("| # | Title | Type | Year | Genres | Source | A likes? | B likes? |\n|---|---|---|---|---|---|---|---|");
      r.rows.forEach((x, i) => console.log(`| ${i + 1} | ${x.title} | ${x.type} | ${x.year} | ${x.genres} | ${x.source} | ${x.a ?? ""} | ${x.b ?? ""} |`));
      console.log();
    }
  }

  const labelled = results.filter((r) => r.labels);
  if (labelled.length) {
    console.log(`\n## Labelled titles (pair ${LABELLED_PAIR})\n`);
    console.log("Chance = share of simulated 12-card draws that include the title. Good titles should be high, bad ones near 0.\n");
    for (const r of labelled) {
      console.log(`### ${MOODS.find((m) => m.id === r.mood)!.name}\n`);
      console.log("| Title | Label | Pool rank | Chance |\n|---|---|---|---|");
      for (const x of r.labels!.rows) console.log(`| ${x.title} | ${x.label} | ${x.rank ?? "not in pool"} | ${pct(x.chance)} |`);
      console.log(`\nExpected good in a draw: ${r.labels!.expectedGood.toFixed(2)} · expected bad: ${r.labels!.expectedBad.toFixed(2)}\n`);
    }
  }

  console.log("\n## Summary\n");
  console.log("| Pair | Mood | Movies / TV (top 10) | Rated | Joint hit rate | Misery rate |\n|---|---|---|---|---|---|");
  for (const r of results) {
    console.log(`| ${r.pair} | ${MOODS.find((m) => m.id === r.mood)!.name} | ${r.movies} / ${r.tv} | ${r.rated}/${r.rows.length} | ${r.hit === null ? "n/a" : pct(r.hit)} | ${r.misery === null ? "n/a" : pct(r.misery)} |`);
  }
  const rated = results.filter((r) => r.hit !== null);
  if (rated.length) {
    const w = rated.reduce((s, r) => s + r.rated, 0);
    console.log(`\nOverall (title-weighted, ${w} rated titles): joint hit ${pct(rated.reduce((s, r) => s + r.hit! * r.rated, 0) / w)}, misery ${pct(rated.reduce((s, r) => s + r.misery! * r.rated, 0) / w)}`);
  }
}

main().catch((e) => {
  console.error(String(e instanceof Error ? e.message : e).replace(/api_key=[^&\s]+/g, "api_key=***"));
  process.exit(1);
});
