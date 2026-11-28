// The curated onboarding movies, shown by app/onboarding/page.tsx and
// components/movies/OnboardingModal.tsx. GET /api/onboarding/movies fetches their
// posters, and POST /api/onboarding only accepts ids from this list, so a request
// can't make the server call TMDB for arbitrary ids (security audit F2). Both pages
// and the API read this one list, so they can't drift apart.
export type OnboardingCluster = { label: string; movies: { id: number; title: string }[] };

export const ONBOARDING_CLUSTERS: readonly OnboardingCluster[] = [
  {
    label: "Mind & Intellect",
    movies: [
      { id: 37799,  title: "The Social Network" },
      { id: 244786, title: "Whiplash" },
      { id: 205596, title: "The Imitation Game" },
      { id: 60308,  title: "Moneyball" },
      { id: 453,    title: "A Beautiful Mind" },
    ],
  },
  {
    label: "Action & Epic",
    movies: [
      { id: 155,    title: "The Dark Knight" },
      { id: 27205,  title: "Inception" },
      { id: 76341,  title: "Mad Max: Fury Road" },
      { id: 98,     title: "Gladiator" },
      { id: 245891, title: "John Wick" },
    ],
  },
  {
    label: "Sci-Fi",
    movies: [
      { id: 603,    title: "The Matrix" },
      { id: 157336, title: "Interstellar" },
      { id: 329865, title: "Arrival" },
      { id: 264660, title: "Ex Machina" },
      { id: 335984, title: "Blade Runner 2049" },
    ],
  },
  {
    label: "Heartwarming Classics",
    movies: [
      { id: 278,  title: "The Shawshank Redemption" },
      { id: 13,   title: "Forrest Gump" },
      { id: 489,  title: "Good Will Hunting" },
      { id: 8358, title: "Cast Away" },
      { id: 497,  title: "The Green Mile" },
    ],
  },
  {
    label: "Comedy & Fun",
    movies: [
      { id: 120467, title: "The Grand Budapest Hotel" },
      { id: 546554, title: "Knives Out" },
      { id: 8363,   title: "Superbad" },
      { id: 445571, title: "Game Night" },
      { id: 55721,  title: "Bridesmaids" },
    ],
  },
  {
    label: "Animation",
    movies: [
      { id: 862,    title: "Toy Story" },
      { id: 129,    title: "Spirited Away" },
      { id: 354912, title: "Coco" },
      { id: 420818, title: "The Lion King" },
      { id: 12,     title: "Finding Nemo" },
    ],
  },
  {
    label: "Thriller & Horror",
    movies: [
      { id: 419430, title: "Get Out" },
      { id: 496243, title: "Parasite" },
      { id: 274,    title: "The Silence of the Lambs" },
      { id: 447332, title: "A Quiet Place" },
      { id: 493922, title: "Hereditary" },
    ],
  },
  {
    label: "Romance & Drama",
    movies: [
      { id: 313369, title: "La La Land" },
      { id: 597,    title: "Titanic" },
      { id: 11036,  title: "The Notebook" },
      { id: 122906, title: "About Time" },
      { id: 4348,   title: "Pride & Prejudice" },
    ],
  },
];

export const ONBOARDING_MOVIE_IDS: readonly number[] = ONBOARDING_CLUSTERS.flatMap((c) =>
  c.movies.map((m) => m.id),
);

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

/** Fewest and most films a person may pick (the recommender needs at least 5 ratings). */
export const MIN_PICKS = 5;
export const MAX_PICKS = 10;

/** True when `count` picks is enough to continue (MIN_PICKS to MAX_PICKS). */
export function canContinue(count: number): boolean {
  return count >= MIN_PICKS && count <= MAX_PICKS;
}

/** The counter shown beside Continue in both onboarding pickers. */
export function picksCounterText(count: number): string {
  return count < MIN_PICKS
    ? `${count} of ${MIN_PICKS} · pick ${MIN_PICKS - count} more`
    : `${count} picked, up to ${MAX_PICKS} for better picks`;
}
