/**
 * The one grid rule for poster lists (design review, "Grid"): 3 columns on
 * phones (2 under 360px), then as many ~150px columns as fit.
 * Lives here (not in PosterCard.tsx) so loading skeletons can share it without importing the card.
 */
export const POSTER_GRID_CLASS =
  "grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:gap-4";
