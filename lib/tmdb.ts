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

  async getTrending(): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/trending/movie/week?api_key=${this.apiKey}`;
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

  async getByGenre(genreIds: number[]): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreIds.join(",")}&sort_by=popularity.desc` +
      `&vote_count.gte=500&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getNewOnStreaming(providerIds?: number[]): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const providerParam =
      providerIds && providerIds.length > 0
        ? `&with_watch_providers=${providerIds.join("|")}`
        : "";
    const url =
      `${this.baseUrl}/discover/movie?sort_by=primary_release_date.desc` +
      `&with_watch_monetization_types=flatrate&watch_region=US` +
      `&primary_release_date.gte=${ninetyDaysAgo}` +
      `&with_original_language=en` +
      `${providerParam}&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getSimilarMovies(movieId: number): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}/similar?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverHiddenGems(genreIds: number[]): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    // OR-joined genres, quality floor, low vote count = hidden gems
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreIds.join("|")}` +
      `&vote_average.gte=6.8&vote_count.gte=150&vote_count.lte=4000` +
      `&sort_by=vote_average.desc&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getMovieRecommendations(movieId: number): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/movie/${movieId}/recommendations?api_key=${this.apiKey}`;
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
    const POPULAR_IDS = new Set([8, 9, 15, 337, 350, 386, 531, 1899]);

    const url = `${this.baseUrl}/watch/providers/movie?watch_region=US&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });

    if (!response.ok) throw new Error("TMDB API error");

    const data = await response.json();
    return (data.results as TMDBWatchProvider[]).filter((p) => POPULAR_IDS.has(p.provider_id));
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

  getPosterUrl(posterPath: string | null, size: "w500" | "original" = "w500"): string | null {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
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

  async getTrendingTV(): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/trending/tv/week?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getSimilarTVShows(tvId: number): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/similar?api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 86400 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async getTVRecommendations(tvId: number): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url = `${this.baseUrl}/tv/${tvId}/recommendations?api_key=${this.apiKey}`;
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

  async discoverMoviesByGenre(genreId: number): Promise<TMDBSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/movie?with_genres=${genreId}` +
      `&sort_by=popularity.desc&vote_count.gte=200&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }

  async discoverTVByGenreSingle(genreId: number): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_genres=${genreId}` +
      `&sort_by=popularity.desc&vote_count.gte=100&api_key=${this.apiKey}`;
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

  async discoverHiddenGemTV(genreIds: number[]): Promise<TMDBTVSearchResponse> {
    if (!this.apiKey) throw new Error("TMDB API key is not configured");
    const url =
      `${this.baseUrl}/discover/tv?with_genres=${genreIds.join("|")}` +
      `&vote_average.gte=7.0&vote_count.gte=100&vote_count.lte=3000` +
      `&sort_by=vote_average.desc&api_key=${this.apiKey}`;
    const response = await fetch(url, { next: { revalidate: 3600 } });
    if (!response.ok) throw new Error("TMDB API error");
    return response.json();
  }
}

export const tmdb = new TMDBClient();
export type { TMDBMovie, TMDBSearchResponse, TMDBMovieDetails, TMDBWatchProvider, TMDBTVShow, TMDBTVSearchResponse, TMDBTVShowDetails, TMDBEpisode, TMDBSeason, TMDBNextEpisode };
