import "server-only";
import { PROVIDER_NAME_OVERRIDES } from "./providers";

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
}

interface TMDBSearchResponse {
  results: TMDBMovie[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface TMDBTVShow {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date: string;
  overview: string;
  genre_ids: number[];
  popularity: number;
  vote_average: number;
  vote_count: number;
}

interface TMDBTVSearchResponse {
  results: TMDBTVShow[];
  page: number;
  total_pages: number;
  total_results: number;
}

interface TMDBEpisode {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  air_date: string | null;
  still_path: string | null;
  vote_average: number;
}

interface TMDBSeason {
  id: number;
  name: string;
  season_number: number;
  episode_count: number;
  air_date: string | null;
  poster_path: string | null;
  overview: string;
}

interface TMDBNextEpisode {
  id: number;
  name: string;
  air_date: string | null;
  episode_number: number;
  season_number: number;
  overview: string;
}

interface TMDBTVShowDetails {
  id: number;
  name: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  episode_run_time?: number[] | null;
  last_episode_to_air?: { runtime?: number | null } | null;
  first_air_date: string;
  last_air_date: string | null;
  overview: string;
  tagline: string | null;
  genres: Array<{ id: number; name: string }>;
  seasons: TMDBSeason[];
  number_of_seasons: number;
  number_of_episodes: number;
  status: string;
  next_episode_to_air: TMDBNextEpisode | null;
  networks: Array<{ id: number; name: string; logo_path: string | null }>;
}

interface TMDBWatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

interface TMDBWatchProvidersResponse {
  results: {
    US?: {
      flatrate?: TMDBWatchProvider[];
      rent?: TMDBWatchProvider[];
      buy?: TMDBWatchProvider[];
    };
  };
}

interface TMDBMovieDetails {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  genres: Array<{ id: number; name: string }>;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function providerParam(providerIds?: number[]): string {
  return providerIds && providerIds.length > 0 ? `&with_watch_providers=${providerIds.join("|")}` : "";
}

class TMDBClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.TMDB_API_KEY || "";
    this.baseUrl = process.env.TMDB_API_BASE_URL || "https://api.themoviedb.org/3";
  }

  async searchMovies(query: string, page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) {
      throw new Error("TMDB API key is not configured");
    }

    const url = `${this.baseUrl}/search/movie?query=${encodeURIComponent(
      query
    )}&page=${page}&api_key=${this.apiKey}`;

    const response = await fetch(url, { next: { revalidate: 3600 } });

    if (!response.ok) {
      throw new Error("TMDB API error");
    }

    return response.json();
  }

  async getMovieDetails(movieId: number): Promise<TMDBMovieDetails> {
    if (!this.apiKey) {
      throw new Error("TMDB API key is not configured");
    }

    const url = `${this.baseUrl}/movie/${movieId}?api_key=${this.apiKey}`;

    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) {
      throw new Error("TMDB API error");
    }

    return response.json();
  }

  async getPopularMovies(page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) {
      throw new Error("TMDB API key is not configured");
    }

    const url = `${this.baseUrl}/movie/popular?page=${page}&api_key=${this.apiKey}`;

    const response = await fetch(url, { next: { revalidate: 3600 } });

    if (!response.ok) {
      throw new Error("TMDB API error");
    }

    return response.json();
  }

  async getTrending(page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/trending/movie/week?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getNowPlaying(): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/now_playing?region=US&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getUpcoming(): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/upcoming?region=US&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getByGenre(genreIds: number[], page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreIds.join(",")}&sort_by=popularity.desc` +
      `&vote_count.gte=500&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  // Recent titles available on the given services. "New" is approximated by release
  // window (movies) or recent episode air dates (TV, so new seasons count) — TMDB
  // doesn't record when a title was added to a service.
  async getNewOnStreaming(providerIds?: number[]): Promise<TMDBSearchResponse> {
    return this.discoverRecentMovies("flatrate", providerIds, 90);
  }

  async getNewToRentOrBuy(): Promise<TMDBSearchResponse> {
    return this.discoverRecentMovies("rent|buy", undefined, 120);
  }

  async getNewOnStreamingTV(providerIds?: number[]): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?sort_by=popularity.desc` +
      `&with_watch_monetization_types=flatrate&watch_region=US` +
      `&air_date.gte=${daysAgo(60)}&air_date.lte=${daysAgo(0)}` +
      `&with_original_language=en` +
      // Skip kids/news/reality/soap/talk — daily shows otherwise crowd out premieres
      `&without_genres=10762,10763,10764,10766,10767` +
      `${providerParam(providerIds)}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getOnTheAirTV(): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/on_the_air?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  private async discoverRecentMovies(
    monetization: string,
    providerIds: number[] | undefined,
    windowDays: number
  ): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?sort_by=popularity.desc` +
      `&with_watch_monetization_types=${monetization}&watch_region=US` +
      `&primary_release_date.gte=${daysAgo(windowDays)}&primary_release_date.lte=${daysAgo(0)}` +
      `&with_original_language=en` +
      `${providerParam(providerIds)}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getSimilarMovies(movieId: number, page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}/similar?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverHiddenGems(genreIds: number[], page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    // OR-joined genres, quality floor, low vote count = hidden gems
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreIds.join("|")}` +
      `&vote_average.gte=6.8&vote_count.gte=150&vote_count.lte=4000` +
      `&sort_by=vote_average.desc&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getMovieRecommendations(movieId: number, page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}/recommendations?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getMovieVideos(movieId: number): Promise<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}/videos?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getAvailableProviders(): Promise<TMDBWatchProvider[]> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");

    // Curated list of popular US streaming service IDs
    const POPULAR_IDS = new Set([8, 9, 15, 337, 350, 386, 1899, 2303]);

    const url = `${this.baseUrl}/watch/providers/movie?watch_region=US&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) throw new Error("TMDB API error");

    const data = await response.json();
    return (data.results as TMDBWatchProvider[])
      .filter((p) => POPULAR_IDS.has(p.provider_id))
      .map((p) => ({ ...p, provider_name: PROVIDER_NAME_OVERRIDES[p.provider_id] ?? p.provider_name }));
  }

  async getWatchProviders(movieId: number): Promise<TMDBWatchProvidersResponse> {
    if (!this.apiKey) {
      throw new Error("TMDB API key is not configured");
    }

    const url = `${this.baseUrl}/movie/${movieId}/watch/providers?api_key=${this.apiKey}`;

    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) {
      throw new Error("TMDB API error");
    }

    return response.json();
  }

  async getMovieDetailsWithCredits(movieId: number): Promise<{
    title: string;
    tagline: string | null;
    overview: string | null;
    poster_path: string | null;
    backdrop_path: string | null;
    release_date: string | null;
    runtime: number | null;
    vote_average: number;
    genres: Array<{ id: number; name: string }>;
    cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>;
    crew: Array<{ id: number; name: string; job: string; department: string }>;
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}?append_to_response=credits&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    const data = await response.json();
    return {
      title: data.title,
      tagline: data.tagline || null,
      overview: data.overview || null,
      poster_path: data.poster_path || null,
      backdrop_path: data.backdrop_path || null,
      release_date: data.release_date || null,
      runtime: typeof data.runtime === "number" && data.runtime > 0 ? data.runtime : null,
      vote_average: typeof data.vote_average === "number" ? data.vote_average : 0,
      genres: data.genres || [],
      cast: (data.credits?.cast || []).slice(0, 8),
      crew: data.credits?.crew || [],
    };
  }

  // ── TV Shows ────────────────────────────────────────────────────────────────

  async searchTVShows(query: string, page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/search/tv?query=${encodeURIComponent(query)}&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVShowDetails(tvId: number): Promise<TMDBTVShowDetails> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVSeasonDetails(tvId: number, seasonNumber: number): Promise<{ episodes: TMDBEpisode[] }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/season/${seasonNumber}?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getPopularTVShows(page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/popular?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTrendingTV(page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/trending/tv/week?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getSimilarTVShows(tvId: number, page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/similar?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVRecommendations(tvId: number, page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/recommendations?page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVWatchProviders(tvId: number): Promise<TMDBWatchProvidersResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/watch/providers?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVVideos(tvId: number): Promise<{ results: Array<{ key: string; site: string; type: string; official: boolean }> }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/videos?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVCredits(tvId: number): Promise<{ cast: Array<{ id: number; name: string; character: string; profile_path: string | null }>; crew: Array<{ id: number; name: string; job: string; department: string }> }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/credits?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  // ── Multi search + person ───────────────────────────────────────────────────

  async searchMulti(query: string): Promise<{
    results: Array<
      | (TMDBMovie & { media_type: "movie" })
      | (TMDBTVShow & { media_type: "tv" })
      | { media_type: "person"; id: number; name: string; profile_path: string | null; known_for_department: string | null; popularity: number }
    >;
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/search/multi?query=${encodeURIComponent(query)}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getPersonDetails(personId: number): Promise<{
    id: number;
    name: string;
    profile_path: string | null;
    known_for_department: string | null;
    biography: string;
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/person/${personId}?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getPersonMovieCredits(personId: number): Promise<{
    cast: Array<TMDBMovie & { character: string }>;
    crew: Array<TMDBMovie & { job: string; department: string }>;
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/person/${personId}/movie_credits?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getPersonTVCredits(personId: number): Promise<{
    cast: Array<TMDBTVShow & { character: string }>;
    crew: Array<TMDBTVShow & { job: string; department: string }>;
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/person/${personId}/tv_credits?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getMovieGenres(): Promise<Array<{ id: number; name: string }>> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/genre/movie/list?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 604800 } });
    if (!response.ok) throw new Error("TMDB API error");
    const data = await response.json();
    return data.genres || [];
  }

  async getTVGenres(): Promise<Array<{ id: number; name: string }>> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/genre/tv/list?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 604800 } });
    if (!response.ok) throw new Error("TMDB API error");
    const data = await response.json();
    return data.genres || [];
  }

  async discoverMoviesByGenre(genreId: number, page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreId}` +
      `&sort_by=popularity.desc&vote_count.gte=200&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverTVByGenreSingle(genreId: number, page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_genres=${genreId}` +
      `&sort_by=popularity.desc&vote_count.gte=100&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  // Popular titles from one country (ISO 3166-1 code), optionally within a genre. The vote
  // floor is lower than the genre-only pages because smaller industries get far fewer votes.
  async discoverMoviesByCountry(country: string, genreId?: number, page = 1): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?with_origin_country=${country}` +
      `${genreId ? `&with_genres=${genreId}` : ""}` +
      `&sort_by=popularity.desc&vote_count.gte=50&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverTVByCountry(country: string, genreId?: number, page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_origin_country=${country}` +
      `${genreId ? `&with_genres=${genreId}` : ""}` +
      `&sort_by=popularity.desc&vote_count.gte=20&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverTVByGenre(genreIds: number[]): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_genres=${genreIds.join(",")}&sort_by=popularity.desc` +
      `&vote_count.gte=200&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  // Generic discover for prebuilt filter params (see lib/moodPicker.ts)
  async discover<T extends "movie" | "tv">(
    media: T,
    params: Record<string, string>,
    page = 1
  ): Promise<T extends "movie" ? TMDBSearchResponse : TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const query = new URLSearchParams({ ...params, page: String(page), api_key: this.apiKey });
    const url = `${this.baseUrl}/discover/${media}?${query}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  // Details + US subscription providers in one call, for checking a known title
  // against mood filters (lib/moodPicker.ts matchesDiscoverParams).
  async getTitleMoodFacts(media: "movie" | "tv", id: number): Promise<{
    id: number;
    title: string;
    posterPath: string | null;
    date: string;
    overview: string;
    popularity: number;
    voteAverage: number;
    voteCount: number;
    genreIds: number[];
    runtime: number | null;
    providerIds: number[];
  }> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/${media}/${id}?append_to_response=watch/providers&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    const d = await response.json();
    const flatrate: TMDBWatchProvider[] = d["watch/providers"]?.results?.US?.flatrate ?? [];
    const runtime = media === "movie" ? d.runtime : tvEpisodeRuntime(d);
    return {
      id: d.id,
      title: media === "movie" ? d.title : d.name,
      posterPath: d.poster_path ?? null,
      date: (media === "movie" ? d.release_date : d.first_air_date) ?? "",
      overview: d.overview ?? "",
      popularity: d.popularity ?? 0,
      voteAverage: d.vote_average ?? 0,
      voteCount: d.vote_count ?? 0,
      genreIds: (d.genres ?? []).map((g: { id: number }) => g.id),
      runtime: typeof runtime === "number" && runtime > 0 ? runtime : null,
      providerIds: flatrate.map((p) => p.provider_id),
    };
  }

  async discoverHiddenGemTV(genreIds: number[], page = 1): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_genres=${genreIds.join("|")}` +
      `&vote_average.gte=7.0&vote_count.gte=100&vote_count.lte=3000` +
      `&sort_by=vote_average.desc&page=${page}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }
}

/**
 * Typical episode length in minutes for a TMDB TV details response. TMDB leaves
 * `episode_run_time` empty for many current shows, so fall back to the latest
 * episode's runtime. Null if neither is a positive number.
 */
export function tvEpisodeRuntime(d: {
  episode_run_time?: number[] | null;
  last_episode_to_air?: { runtime?: number | null } | null;
}): number | null {
  for (const r of [d.episode_run_time?.[0], d.last_episode_to_air?.runtime]) {
    if (typeof r === "number" && r > 0) return r;
  }
  return null;
}

export const tmdb = new TMDBClient();
export type { TMDBMovie, TMDBSearchResponse, TMDBMovieDetails, TMDBWatchProvider, TMDBTVShow, TMDBTVSearchResponse, TMDBTVShowDetails, TMDBEpisode, TMDBSeason, TMDBNextEpisode };
