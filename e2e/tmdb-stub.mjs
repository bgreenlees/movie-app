// A tiny fake of the TMDB API for the end-to-end smoke tests (issue #110).
//
// The app reads its TMDB base URL from TMDB_API_BASE_URL, so the tests point it
// here. That keeps CI free of the real TMDB key and free of network flakiness,
// and gives every run the same titles. Only the shapes the app reads are
// faked; anything unrecognised gets an empty paged list.
//
//   node e2e/tmdb-stub.mjs [port]      (default 4310; listens on 127.0.0.1 only)
import http from "node:http";
import { pathToFileURL } from "node:url";

// Stub ids start high so they can't clash with real TMDB ids a developer might
// already have saved in the dev database, and so teardown can find them.
export const STUB_ID_BASE = 990000;
const MOVIE_COUNT = 30;
const TV_COUNT = 20;
const PAGE_SIZE = 20;

const GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
  { id: 18, name: "Drama" },
];

function isoDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
}

export const movies = Array.from({ length: MOVIE_COUNT }, (_, i) => ({
  id: STUB_ID_BASE + 1 + i,
  title: `Stub Movie ${i + 1}`,
  poster_path: `/stub-movie-${i + 1}.jpg`,
  backdrop_path: null,
  release_date: isoDate(30 + i * 10),
  overview: `A stand-in movie number ${i + 1}.`,
  genre_ids: [GENRES[i % GENRES.length].id],
  popularity: 100 - i,
  vote_average: 7.5,
  vote_count: 2000,
  runtime: 100,
}));

export const shows = Array.from({ length: TV_COUNT }, (_, i) => ({
  id: STUB_ID_BASE + 501 + i,
  name: `Stub Show ${i + 1}`,
  poster_path: `/stub-show-${i + 1}.jpg`,
  first_air_date: isoDate(60 + i * 10),
  overview: `A stand-in show number ${i + 1}.`,
  genre_ids: [GENRES[i % GENRES.length].id],
  popularity: 80 - i,
  vote_average: 7.8,
  vote_count: 1500,
}));

// Real paging: page N is the Nth slice of PAGE_SIZE items, and past the end is empty. The stub
// has 30 movies and 20 shows, so movies get a second page of 10 (the Discover "load more" test
// relies on it) and shows have just one. Slices never overlap, so code that loads several
// pages never sees duplicates.
const pageOf = (items, page) => ({
  page,
  total_pages: Math.max(1, Math.ceil(items.length / PAGE_SIZE)),
  total_results: items.length,
  results: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
});

const provider = { provider_id: 8, provider_name: "Stub Stream", logo_path: "/stub-logo.jpg" };
const providers = { id: 0, results: { US: { flatrate: [provider] } } };

function movieDetails(m) {
  return {
    ...m,
    genres: GENRES.filter((g) => m.genre_ids.includes(g.id)),
    tagline: "",
    status: "Released",
    credits: { cast: [], crew: [] },
    "watch/providers": providers,
  };
}

function showDetails(s) {
  return {
    ...s,
    backdrop_path: null,
    last_air_date: s.first_air_date,
    tagline: "",
    genres: GENRES.filter((g) => s.genre_ids.includes(g.id)),
    seasons: [{ id: s.id * 10 + 1, name: "Season 1", season_number: 1, episode_count: 8, air_date: s.first_air_date, poster_path: null, overview: "" }],
    number_of_seasons: 1,
    number_of_episodes: 8,
    episode_run_time: [45],
    last_episode_to_air: { runtime: 45 },
    status: "Ended",
    next_episode_to_air: null,
    networks: [],
    "watch/providers": providers,
  };
}

/** Maps a TMDB path (without the /3 prefix or query) to a JSON body, or null for 404. */
export function route(pathname, query) {
  const page = Number(query.get("page") || 1);
  const q = (query.get("query") || "").toLowerCase();
  const parts = pathname.split("/").filter(Boolean);
  const [a, b, c] = parts;

  if (a === "genre") return { genres: GENRES };
  if (a === "search") {
    const m = movies.filter((x) => x.title.toLowerCase().includes(q));
    const s = shows.filter((x) => x.name.toLowerCase().includes(q));
    if (b === "movie") return pageOf(m, page);
    if (b === "tv") return pageOf(s, page);
    return pageOf([...m.map((x) => ({ ...x, media_type: "movie" })), ...s.map((x) => ({ ...x, media_type: "tv" }))], page);
  }
  if (a === "discover" || a === "trending") {
    return pageOf(b === "tv" || c === "tv" ? shows : movies, page);
  }
  if (a === "watch" && b === "providers") return { results: [provider] };
  if (a === "movie" || a === "tv") {
    const list = a === "movie" ? movies : shows;
    if (/^\d+$/.test(b ?? "")) {
      const item = list.find((x) => x.id === Number(b));
      if (!item) return null;
      if (c === "videos") return { id: item.id, results: [] };
      if (c === "watch") return providers;
      if (c === "credits") return { cast: [], crew: [] };
      if (c === "similar" || c === "recommendations") return pageOf(list.filter((x) => x.id !== item.id), page);
      if (c === "season") return { episodes: [] };
      return a === "movie" ? movieDetails(item) : showDetails(item);
    }
    // popular, now_playing, upcoming, on_the_air, top_rated…
    return pageOf(list, page);
  }
  // person/* and anything else: an empty answer rather than an error
  return { page: 1, total_pages: 1, total_results: 0, results: [], cast: [], crew: [] };
}

export function startStub(port = 4310) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://stub");
    const body = route(url.pathname.replace(/^\/3(?=\/)/, ""), url.searchParams);
    res.setHeader("content-type", "application/json");
    res.statusCode = body ? 200 : 404;
    res.end(JSON.stringify(body ?? { status_message: "Not found" }));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const port = Number(process.argv[2] ?? 4310);
  await startStub(port);
  console.log(`TMDB stub listening on http://127.0.0.1:${port}`);
}
