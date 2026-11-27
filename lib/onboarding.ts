// The curated onboarding movies. GET /api/onboarding/movies fetches their posters,
// and POST /api/onboarding only accepts ids from this list, so a request can't make
// the server call TMDB for arbitrary ids (security audit F2).
export const ONBOARDING_MOVIE_IDS = [
  37799, 244786, 205596, 60308, 453,    // Mind & Intellect
  155, 27205, 76341, 98, 245891,         // Action & Epic
  603, 157336, 329865, 264644, 335984,   // Sci-Fi
  278, 13, 489, 8358, 497,               // Heartwarming Classics
  120467, 546554, 8363, 445571, 55721,   // Comedy & Fun
  862, 129, 354912, 420818, 12,          // Animation
  419430, 496243, 274, 447332, 493922,   // Thriller & Horror
  313369, 597, 11036, 122906, 4348,      // Romance & Drama
] as const;

/** The most ids one onboarding request may send (the size of the curated list). */
export const MAX_ONBOARDING_IDS = 40;

const ALLOWED = new Set<number>(ONBOARDING_MOVIE_IDS);

/**
 * Validates the `movieIds` sent by the onboarding page. Returns the de-duplicated
 * ids that are on the curated list, or null when the input isn't an array or is
 * longer than MAX_ONBOARDING_IDS (the caller answers 400). Unknown ids are dropped.
 */
export function parseOnboardingIds(input: unknown): number[] | null {
  if (!Array.isArray(input) || input.length > MAX_ONBOARDING_IDS) return null;
  const ids = new Set<number>();
  for (const id of input) {
    if (typeof id === "number" && ALLOWED.has(id)) ids.add(id);
  }
  return [...ids];
}
