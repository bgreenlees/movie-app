import { beforeEach, describe, expect, it, vi } from "vitest";

// Route tests for the `page` query param added for "load more" on Discover (issue #186):
// every route Discover pages through rejects a bad page with 400 (before touching TMDB)
// and hands a good page on to TMDB. Auth, Prisma and TMDB are mocked: no network, no database.
const m = vi.hoisted(() => {
  const empty = { results: [], page: 1, total_pages: 1, total_results: 0 };
  return {
    auth: vi.fn(),
    prisma: {
      watchlistEntry: { findMany: vi.fn(), count: vi.fn() },
      tVWatchlistEntry: { findMany: vi.fn() },
    },
    tmdb: {
      discoverMoviesByCountry: vi.fn().mockResolvedValue(empty),
      discoverMoviesByGenre: vi.fn().mockResolvedValue(empty),
      discoverTVByCountry: vi.fn().mockResolvedValue(empty),
      discoverTVByGenreSingle: vi.fn().mockResolvedValue(empty),
      getByGenre: vi.fn().mockResolvedValue(empty),
      searchMovies: vi.fn().mockResolvedValue({ ...empty, results: [{ id: 1 }] }),
      searchTVShows: vi.fn().mockResolvedValue({ ...empty, results: [{ id: 1 }] }),
      getTrendingTV: vi.fn().mockResolvedValue(empty),
      getMovieRecommendations: vi.fn().mockResolvedValue(empty),
      getSimilarMovies: vi.fn().mockResolvedValue(empty),
      discoverHiddenGems: vi.fn().mockResolvedValue(empty),
      getTVRecommendations: vi.fn().mockResolvedValue(empty),
      getSimilarTVShows: vi.fn().mockResolvedValue(empty),
      discoverHiddenGemTV: vi.fn().mockResolvedValue(empty),
    },
  };
});
vi.mock("@/lib/auth", () => ({ auth: m.auth }));
vi.mock("@/lib/db", () => ({ prisma: m.prisma }));
vi.mock("@/lib/tmdb", () => ({ tmdb: m.tmdb }));
vi.mock("@/lib/fuzzySearch", () => ({ fuzzySearch: vi.fn().mockResolvedValue({ results: [] }) }));
// The Vitest setup has no "@/" alias, so map the pure helpers to the real modules.
vi.mock("@/lib/apiGuard", () => import("../../../lib/apiGuard"));
vi.mock("@/lib/contextualFeed", () => import("../../../lib/contextualFeed"));
vi.mock("@/lib/countries", () => import("../../../lib/countries"));
vi.mock("@/lib/discoverPaging", () => import("../../../lib/discoverPaging"));
vi.mock("@/lib/rateLimit", () => import("../../../lib/rateLimit"));

import { GET as discoverMovie } from "./movie/route";
import { GET as discoverTV } from "./tv/route";
import { GET as contextual } from "../movies/contextual/route";
import { GET as moviesSearch } from "../movies/search/route";
import { GET as tvSearch } from "../tv/search/route";
import { GET as moviesRecommended } from "../movies/recommended/route";
import { GET as tvRecommended } from "../tv/recommended/route";

type Handler = (req: never) => Promise<Response>;
const call = (handler: Handler, path: string, query: string) => {
  const url = new URL(`http://localhost${path}?${query}`);
  return handler({ nextUrl: url, url: url.toString() } as never);
};

// [name, handler, path, base query, tmdb method that must receive the page, index of the page argument]
const routes: Array<[string, Handler, string, string, keyof typeof m.tmdb, number]> = [
  ["discover movie (genre)", discoverMovie as Handler, "/api/discover/movie", "genreId=18", "discoverMoviesByGenre", 1],
  ["discover movie (country)", discoverMovie as Handler, "/api/discover/movie", "country=KR", "discoverMoviesByCountry", 2],
  ["discover tv (genre)", discoverTV as Handler, "/api/discover/tv", "genreId=18", "discoverTVByGenreSingle", 1],
  ["discover tv (country)", discoverTV as Handler, "/api/discover/tv", "country=KR", "discoverTVByCountry", 2],
  ["movies contextual", contextual as Handler, "/api/movies/contextual", "hour=21", "getByGenre", 1],
  ["movies search", moviesSearch as Handler, "/api/movies/search", "q=heat", "searchMovies", 1],
  ["tv search", tvSearch as Handler, "/api/tv/search", "q=heat", "searchTVShows", 1],
  ["movies recommended", moviesRecommended as Handler, "/api/movies/recommended", "", "getMovieRecommendations", 1],
  ["tv recommended", tvRecommended as Handler, "/api/tv/recommended", "", "getTVRecommendations", 1],
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.auth.mockResolvedValue({ user: { id: "u1" } });
  // A rated user with a valid local hour gets the genre feed (new users get Trending: see contextualFeed.test.ts)
  m.prisma.watchlistEntry.count.mockResolvedValue(1);
  // One rated entry so the recommended routes take the personalised path that calls TMDB per seed
  m.prisma.watchlistEntry.findMany.mockImplementation(async (args: { where: { rating?: unknown } }) =>
    args.where.rating ? [{ movieId: 5, rating: 3, movie: { genres: [{ id: 18 }] } }] : []
  );
  m.prisma.tVWatchlistEntry.findMany.mockImplementation(async (args: { where: { rating?: unknown } }) =>
    args.where.rating ? [{ tvShowId: 6, rating: 3, tvShow: { genres: [{ id: 18 }] } }] : []
  );
});

describe.each(routes)("%s", (_name, handler, path, base, method, pageArg) => {
  const q = (page: string) => [base, `page=${page}`].filter(Boolean).join("&");

  it.each(["0", "-1", "21", "abc", "2.5", "1e1"])("rejects page=%s with 400 and never calls TMDB", async (bad) => {
    const res = await call(handler, path, q(bad));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid page" });
    for (const fn of Object.values(m.tmdb)) expect(fn).not.toHaveBeenCalled();
  });

  it("passes a valid page on to TMDB", async () => {
    const res = await call(handler, path, q("3"));
    expect(res.status).toBe(200);
    const calls = m.tmdb[method].mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const pages = calls.map((c: unknown[]) => c[pageArg]);
    // Country browse fetches two TMDB pages per request page: 3 -> 5 and 6
    expect(pages).toEqual(pageArg === 2 ? [5, 6] : expect.arrayContaining([3]));
  });

  it("defaults to page 1 when page is missing", async () => {
    const res = await call(handler, path, base);
    expect(res.status).toBe(200);
    const pages = m.tmdb[method].mock.calls.map((c: unknown[]) => c[pageArg]);
    expect(pages).toEqual(pageArg === 2 ? [1, 2] : expect.arrayContaining([1]));
  });
});

it("still requires a signed-in user", async () => {
  m.auth.mockResolvedValue(null);
  const res = await call(discoverMovie as Handler, "/api/discover/movie", "genreId=18&page=2");
  expect(res.status).toBe(401);
});
