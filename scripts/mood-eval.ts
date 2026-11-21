// Mood picker quality check: what does each mood combination actually return?
//
// Runs the real mood → TMDB discover mapping (lib/moodPicker.ts) for a fixed set
// of combinations and prints a sample of what a user would be shown, with genres,
// so a person can mark each title as fitting the mood or not. Re-run it after
// changing the mapping and compare.
//
//   npm run eval:moods                 # markdown table to stdout
//   npm run eval:moods -- --json       # raw JSON (for diffing between runs)
//
// Needs TMDB_API_KEY (from .env.local). Calls TMDB only, never the database. Not a
// Vitest test on purpose: it hits the network and its output needs human judgement.

import {
  DEFAULT_SELECTION,
  mediaTypesFor,
  moodToDiscoverParams,
  blendPools,
  candidateKey,
  pickRecommendations,
  type MoodCandidate,
  type MoodSelection,
} from "../lib/moodPicker";

const API = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
const KEY = process.env.TMDB_API_KEY;
const SAMPLE = 12; // titles shown per combination
const PAGES = [1, 2, 3]; // same as app/api/mood-picks
const POOL_SIZE = 60; // same as app/api/mood-picks
const NETFLIX = 8;

const COMBOS: Array<{ name: string; sel: Partial<MoodSelection>; providers?: number[] }> = [
  { name: "Light · Movies", sel: { vibe: "light", media: "movie" } },
  { name: "Light · TV", sel: { vibe: "light", media: "tv" } },
  { name: "Heavy · Movies", sel: { vibe: "heavy", media: "movie" } },
  { name: "Heavy · TV", sel: { vibe: "heavy", media: "tv" } },
  { name: "Intense · Movies", sel: { vibe: "intense", media: "movie" } },
  { name: "Intense · TV", sel: { vibe: "intense", media: "tv" } },
  { name: "Light + Under 2 hrs · Movies", sel: { vibe: "light", time: "120", media: "movie" } },
  { name: "Intense + Under 2 hrs · Movies", sel: { vibe: "intense", time: "120", media: "movie" } },
  { name: "~30 min · TV", sel: { time: "30", media: "tv" } },
  { name: "Something new · Movies", sel: { fresh: true, media: "movie" } },
  { name: "Intense + Something new · TV", sel: { vibe: "intense", fresh: true, media: "tv" } },
  { name: "Light + On Netflix · Both", sel: { vibe: "light", onMyServices: true }, providers: [NETFLIX] },
  // "Both" is the default. There's no movie/TV quota: both compete on the same
  // traits, so the split reported below should follow the mood (e.g. Short + Light
  // leaning to sitcoms), not sit at 50/50.
  { name: "Light · Both", sel: { vibe: "light", media: "both" } },
  { name: "Intense · Both", sel: { vibe: "intense", media: "both" } },
  // The "Thursday night" cases: with an evening free, films and series compete;
  // with half an hour, runtimes alone should leave mostly episodes.
  { name: "~30 min · Both", sel: { time: "30", media: "both" } },
  { name: "Light + ~30 min · Both", sel: { vibe: "light", time: "30", media: "both" } },
  { name: "Intense + Under 2 hrs · Both", sel: { vibe: "intense", time: "120", media: "both" } },
  // Thursday night with the evening free and the energy for something serious
  { name: "Heavy · Both", sel: { vibe: "heavy", media: "both" } },
  { name: "Something new · Both", sel: { fresh: true, media: "both" } },
  { name: "Everything ticked · Movies (sparse)", sel: { vibe: "intense", time: "120", fresh: true, onMyServices: true, media: "movie" }, providers: [NETFLIX] },
];

type Row = { id: number; genreIds: number[]; media: "movie" | "tv"; title: string; year: string; genres: string; rating: number; votes: number; runtime?: number | null };

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...params, api_key: KEY! });
  const res = await fetch(`${API}${path}?${q}`);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

const toCandidate = (r: Row): MoodCandidate => ({
  id: r.id, mediaType: r.media, title: r.title, posterPath: "/x", date: r.year,
  overview: "", popularity: 0, voteAverage: r.rating, voteCount: r.votes, genreIds: r.genreIds,
});

// Deterministic draws so two runs with the same mapping are comparable
function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

async function main() {
  if (!KEY) throw new Error("TMDB_API_KEY not set — run with .env.local loaded (see npm run eval:moods)");
  const json = process.argv.includes("--json");

  const genreNames = new Map<string, string>();
  for (const m of ["movie", "tv"] as const) {
    const { genres } = await get<{ genres: { id: number; name: string }[] }>(`/genre/${m}/list`);
    genres.forEach((g) => genreNames.set(`${m}-${g.id}`, g.name));
  }

  const today = new Date();
  const out: Array<{ name: string; params: Record<string, Record<string, string>>; total: number; rows: Row[]; mix?: string }> = [];

  for (const combo of COMBOS) {
    const sel = { ...DEFAULT_SELECTION, ...combo.sel };
    const params: Record<string, Record<string, string>> = {};
    let total = 0;
    const fetched: Row[] = [];
    const groups: { candidates: MoodCandidate[]; total: number }[] = [];

    for (const media of mediaTypesFor(sel.media)) {
      let mediaTotal = 0;
      const start = fetched.length;
      const p = moodToDiscoverParams(sel, media, { today, providerIds: combo.providers ?? [] });
      params[media] = p;
      for (const page of PAGES) {
        type R = { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; genre_ids: number[]; vote_average: number; vote_count: number; poster_path: string | null };
        const d = await get<{ results: R[]; total_results: number }>(`/discover/${media}`, { ...p, page: String(page) });
        if (page === 1) mediaTotal = d.total_results;
        for (const r of d.results.filter((r) => r.poster_path)) {
          fetched.push({
            id: r.id,
            genreIds: r.genre_ids,
            media,
            title: r.title ?? r.name ?? "?",
            year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
            genres: r.genre_ids.map((g) => genreNames.get(`${media}-${g}`) ?? g).join(", "),
            rating: r.vote_average,
            votes: r.vote_count,
          });
        }
      }
      total += mediaTotal;
      groups.push({ total: mediaTotal, candidates: fetched.slice(start).map(toCandidate) });
    }

    // Same pool-building as app/api/mood-picks: each type's share follows its match count
    const blended = new Set(blendPools(groups, POOL_SIZE).map(candidateKey));
    const pool = fetched.filter((r) => blended.has(candidateKey(toCandidate(r))));

    // Sample through the real picker (tone/quality-weighted draw) so the table
    // shows what users would actually be offered, not the raw pool
    const byKey = new Map(pool.map((r) => [candidateKey(toCandidate(r)), r]));
    const rows = pickRecommendations(pool.map(toCandidate), {
      watchlist: new Set(), exclude: new Set(), selection: sel, count: SAMPLE, random: seeded(42),
    }).map((p) => byKey.get(candidateKey(p))!);
    // TMDB's discover runtime filter is leaky (it has returned 3-hour films for
    // "≤100 min"), so when time is limited look up each sampled title's real runtime.
    if (sel.time !== "any") {
      for (const r of rows) {
        const d = await get<{ runtime?: number; episode_run_time?: number[] }>(`/${r.media}/${r.id}`);
        r.runtime = (r.media === "movie" ? d.runtime : d.episode_run_time?.[0]) || null;
      }
    }
    // For "Both", report the movie/TV split of the 5 picks across 20 shuffles —
    // an outcome of the trait scoring, not a target
    let mix: string | undefined;
    if (sel.media === "both") {
      const candidates = pool.map(toCandidate);
      const pickRand = seeded(7);
      let movies = 0, shows = 0, mixedSets = 0;
      for (let i = 0; i < 20; i++) {
        const picks = pickRecommendations(candidates, { watchlist: new Set(), exclude: new Set(), selection: sel, random: pickRand });
        const m = picks.filter((p) => p.mediaType === "movie").length;
        movies += m;
        shows += picks.length - m;
        if (m > 0 && m < picks.length) mixedSets++;
      }
      const poolTV = pool.filter((r) => r.media === "tv").length;
      mix = `Pool: ${pool.length - poolTV} movies / ${poolTV} TV · picks over 20 shuffles: ${movies / 20} movies + ${shows / 20} TV per set, ${mixedSets}/20 sets mixed`;
    }
    out.push({ name: combo.name, params, total, rows, mix });
  }

  if (json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  for (const c of out) {
    console.log(`\n## ${c.name}\n`);
    console.log(`TMDB matches: ${c.total} · sampled ${c.rows.length}\n`);
    if (c.mix) console.log(`${c.mix}\n`);
    const rt = c.rows.some((r) => r.runtime !== undefined);
    console.log(`| Fits? | Type | Title | Year | Genres | Rating |${rt ? " Runtime |" : ""}`);
    console.log(`|---|---|---|---|---|---|${rt ? "---|" : ""}`);
    for (const r of c.rows) {
      const runtime = rt ? ` ${r.runtime ?? "?"} min |` : "";
      console.log(`|  | ${r.media} | ${r.title} | ${r.year} | ${r.genres} | ${r.rating.toFixed(1)} (${r.votes}) |${runtime}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
