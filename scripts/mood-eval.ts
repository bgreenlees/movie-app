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

import { mediaTypesFor, moodToDiscoverParams, DEFAULT_SELECTION, type MoodSelection } from "../lib/moodPicker";

const API = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
const KEY = process.env.TMDB_API_KEY;
const SAMPLE = 12; // titles shown per combination
const PAGES = [1, 2, 3]; // same as app/api/mood-picks
const NETFLIX = 8;

const COMBOS: Array<{ name: string; sel: Partial<MoodSelection>; providers?: number[] }> = [
  { name: "Light · Movies", sel: { vibe: "light", media: "movie" } },
  { name: "Light · TV", sel: { vibe: "light", media: "tv" } },
  { name: "Intense · Movies", sel: { vibe: "intense", media: "movie" } },
  { name: "Intense · TV", sel: { vibe: "intense", media: "tv" } },
  { name: "Light + Short · Movies", sel: { vibe: "light", short: true, media: "movie" } },
  { name: "Light + Short · TV", sel: { vibe: "light", short: true, media: "tv" } },
  { name: "Intense + Short · Movies", sel: { vibe: "intense", short: true, media: "movie" } },
  { name: "Short · TV", sel: { short: true, media: "tv" } },
  { name: "Something new · Movies", sel: { fresh: true, media: "movie" } },
  { name: "Intense + Something new · TV", sel: { vibe: "intense", fresh: true, media: "tv" } },
  { name: "Light + On Netflix · Both", sel: { vibe: "light", onMyServices: true }, providers: [NETFLIX] },
  { name: "Everything ticked · Movies (sparse)", sel: { vibe: "intense", short: true, fresh: true, onMyServices: true, media: "movie" }, providers: [NETFLIX] },
];

type Row = { id: number; media: "movie" | "tv"; title: string; year: string; genres: string; rating: number; votes: number; runtime?: number | null };

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const q = new URLSearchParams({ ...params, api_key: KEY! });
  const res = await fetch(`${API}${path}?${q}`);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

// Deterministic sample so two runs with the same mapping are comparable
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
  const out: Array<{ name: string; params: Record<string, Record<string, string>>; total: number; rows: Row[] }> = [];

  for (const combo of COMBOS) {
    const sel = { ...DEFAULT_SELECTION, ...combo.sel };
    const params: Record<string, Record<string, string>> = {};
    let total = 0;
    const pool: Row[] = [];

    for (const media of mediaTypesFor(sel.media)) {
      const p = moodToDiscoverParams(sel, media, { today, providerIds: combo.providers ?? [] });
      params[media] = p;
      for (const page of PAGES) {
        type R = { id: number; title?: string; name?: string; release_date?: string; first_air_date?: string; genre_ids: number[]; vote_average: number; vote_count: number; poster_path: string | null };
        const d = await get<{ results: R[]; total_results: number }>(`/discover/${media}`, { ...p, page: String(page) });
        if (page === 1) total += d.total_results;
        for (const r of d.results.filter((r) => r.poster_path)) {
          pool.push({
            id: r.id,
            media,
            title: r.title ?? r.name ?? "?",
            year: (r.release_date ?? r.first_air_date ?? "").slice(0, 4),
            genres: r.genre_ids.map((g) => genreNames.get(`${media}-${g}`) ?? g).join(", "),
            rating: r.vote_average,
            votes: r.vote_count,
          });
        }
      }
    }

    const rand = seeded(42);
    const rows = [...pool].sort(() => rand() - 0.5).slice(0, SAMPLE);
    // TMDB's discover runtime filter is leaky (it has returned 3-hour films for
    // "≤100 min"), so for Short combos look up each sampled title's real runtime.
    if (sel.short) {
      for (const r of rows) {
        const d = await get<{ runtime?: number; episode_run_time?: number[] }>(`/${r.media}/${r.id}`);
        r.runtime = (r.media === "movie" ? d.runtime : d.episode_run_time?.[0]) || null;
      }
    }
    out.push({ name: combo.name, params, total, rows });
  }

  if (json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  for (const c of out) {
    console.log(`\n## ${c.name}\n`);
    console.log(`TMDB matches: ${c.total} · sampled ${c.rows.length}\n`);
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
