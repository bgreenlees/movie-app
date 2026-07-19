# Spec: More like this

**Goal**: from the movie/TV detail modal, browse similar titles without losing flow.

## Data source

- `tmdb.getMovieRecommendations` first; if `< 6` results, fall back to `tmdb.getSimilarMovies` and dedupe.
- Same for TV via `tmdb.getTVRecommendations` / `tmdb.getSimilarTVShows`.

## Backend routes

- `GET /api/movies/[id]/recommendations` → returns up to 12 titles after fallback + dedupe.
- `GET /api/tv/[id]/recommendations` → same shape, TV version.

## Frontend

### MovieDetailModal + TV equivalent

- Below "Top Cast", new section: **"More like this"**.
- Horizontal-scroll row, 8–12 posters, each ~120px wide. Title + TMDB rating under each poster.
- Each poster has an "on your list" indicator (small badge, top-right corner) when the movie is in the user's watchlist in any status. Do NOT exclude — visible so users see the recommender's quality.
- Click a poster → **modal swap**: replace the current modal's content with the new title's, push previous title onto a client-side back-stack.
- Back arrow appears in the modal header when the stack has entries. Click → pop and restore previous title. Escape/close resets the stack.
- Loading state: skeleton row while fetching.
- Empty state (no recs at all): section hidden entirely.

### Interactions

- Adding to watchlist from the "More like this" row: same modal-based add flow, does not affect the back-stack.
- Rating buttons in the "More like this" row: use `ThumbRating` inline, same as the discover grid.

## Out of scope for v1

- Cross-media recs (movie → similar TV shows).
- Personalized re-ranking of TMDB's list based on user's watchlist history.

## Rollback surface

- New routes: `/api/movies/[id]/recommendations`, `/api/tv/[id]/recommendations`.
- Diff on `MovieDetailModal.tsx` and the TV equivalent — new bottom section + back-stack state.
- No schema changes.
