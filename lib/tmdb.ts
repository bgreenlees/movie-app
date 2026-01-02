interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  genre_ids: number[];
}

interface TMDBSearchResponse {
  results: TMDBMovie[];
  page: number;
  total_pages: number;
  total_results: number;
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

  getPosterUrl(posterPath: string | null, size: "w500" | "original" = "w500"): string | null {
    if (!posterPath) return null;
    return `https://image.tmdb.org/t/p/${size}${posterPath}`;
  }
}

export const tmdb = new TMDBClient();
export type { TMDBMovie, TMDBSearchResponse, TMDBMovieDetails };
