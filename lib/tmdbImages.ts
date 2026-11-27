// Pure TMDB image-URL helpers. Kept apart from lib/tmdb.ts (which is server-only
// because it holds the API client and key) so client components can build poster
// URLs without bundling the TMDB client.

const IMAGE_BASE = "https://image.tmdb.org/t/p";

export function getPosterUrl(posterPath: string | null, size: "w500" | "original" = "w500"): string | null {
  if (!posterPath) return null;
  return `${IMAGE_BASE}/${size}${posterPath}`;
}

export function getBackdropUrl(backdropPath: string | null, size: "w780" | "w1280" = "w1280"): string | null {
  if (!backdropPath) return null;
  return `${IMAGE_BASE}/${size}${backdropPath}`;
}
