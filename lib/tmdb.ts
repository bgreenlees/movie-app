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
}

export const tmdb = new TMDBClient();
export type { TMDBMovie, TMDBSearchResponse, TMDBMovieDetails, TMDBWatchProvider };
