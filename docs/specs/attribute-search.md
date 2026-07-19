# Spec: Attribute search (movies + TV)

**Goal**: let users find movies and TV by director, actor, or genre — not just title.

## Data source

- `/search/multi` on TMDB for the typeahead — returns movies, TV, and people in one call.
- `/discover/movie` and `/discover/tv` with `with_cast=` / `with_crew=` / `with_genres=` for results.
- `/person/{id}` for the person header (name, photo, known-for department).
- `/person/{id}/movie_credits` and `/person/{id}/tv_credits` for filmography.

## Backend routes

- `GET /api/search/multi?q=` → wraps `/search/multi`, returns `{ movies, tvShows, people, genres }`. Genres derived by fuzzy-matching `q` against the cached TMDB genre lists.
- `GET /api/person/[id]` → returns `{ name, profilePath, knownFor, movieCast, movieCrewDirected, tvCast, tvCrewDirected }` by combining `/person/{id}/movie_credits` and `/person/{id}/tv_credits`. If someone is both director and actor of the same title, it appears in both arrays (list-twice).
- `GET /api/discover/movie?genreId=` and `GET /api/discover/tv?genreId=` → thin wrappers on TMDB discover.

## Frontend

### Navbar typeahead (extend `components/layout/Navbar.tsx`)

- Suggestions dropdown, three grouped sections with headers:
  - **Titles** (up to 5): movies + TV mixed, poster + year + media-type badge.
  - **People** (up to 3): profile pic + name + role hint from `known_for_department`.
  - **Genres** (up to 2): chip-style, only if `q` matches a genre name.
- Enter key on plain query → `/search?q=…` (existing behavior, unchanged).
- Clicking a person → `/search?personId=123`.
- Clicking a genre → `/search?genreId=28&genreName=Action`.

### Search results page (extend `app/(main)/search/page.tsx`)

- Reads `personId`, `genreId`, `q` from URL.
- Person mode: header with photo + name, then up to 4 sections depending on what has content:
  - "Movies with {name}"
  - "Movies directed by {name}"
  - "TV shows with {name}"
  - "TV shows directed by {name}"
  - Media-type toggle collapses to just movies or just TV.
- Genre mode: single grid, respects Movies/TV toggle, sorted by popularity.
- Plain query mode: unchanged.

## Out of scope for v1

- Combining actor + director + genre in a single query (e.g. "Denzel action") — v2.
- Person bios, filmography deep-links.

## Rollback surface

- New routes: `/api/search/multi`, `/api/person/[id]`, `/api/discover/movie`, `/api/discover/tv`.
- Diff on `Navbar.tsx` (dropdown grouping) and `search/page.tsx` (new URL modes).
- No schema changes.
