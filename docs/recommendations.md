# How recommendations work

The single reference for every place the app recommends a title. **Keep it current**: any PR that
changes a source, score, filter, draw or "why" line updates this file in the same PR.

- Plan for one engine: `docs/specs/recommendation-engine.md` (#199).
- Watch together matching research: `docs/research/watch-together-matching.md` (#193).
- Evals: `docs/evals/mood-picker.md`, `docs/evals/watch-together.md`.

Last verified against the code: 2026-11-28 (`main` at 9e447b1).

## Signals we have

All per user, in `WatchlistEntry` (movies) and `TVWatchlistEntry` (TV).

| Signal | Stored as | Meaning |
|---|---|---|
| ♥ Love | `rating = 3` | strongest positive |
| 👍 Like | `rating = 2` | positive |
| 👎 Dislike | `rating = 1` | negative |
| Want to watch | `status = WANT_TO_WATCH` | intent, positive |
| Watching (TV) | `status = WATCHING` | intent, positive |
| Watched | `status = WATCHED` | seen; no taste meaning unless rated |
| Not for me | `status = NOT_INTERESTED` | negative; excluded everywhere |
| Onboarding picks | `WATCHED` + `rating = 3` | written by `app/api/onboarding` (movies only) |

Notes:
- `rating` is a plain `Int?`, so out-of-range values (0, 999) can exist if written by old code or
  scripts. Discover treats any value ≥ 2 as positive (999 → Like weight); `pairTaste` ignores
  unknown values. The engine should clamp to 1–3 on read.
- #190 (poster card redesign) proposes removing "Not for me" from the card. That weakens our only
  explicit "don't show me this" signal; if it goes, the tester "bad pick" (below) or a detail-page
  action should replace it.
- Movie taste and TV taste are separate everywhere except the pair taste profile
  (`lib/pairTaste.ts`), which mixes both through shared genre traits.

## Spots, one by one

### 1. Discover "Recommended for You" (solo) — owner: "works very well"

- Routes: `app/api/movies/recommended/route.ts`, `app/api/tv/recommended/route.ts` (near-identical
  copies; differ only in types and the TMDB client calls).
- Callers: `app/(main)/search/page.tsx` (Discover, movies + TV), `app/(main)/tv/page.tsx`.
- Paging: `?page=N` re-runs the same scoring over TMDB page N of each source (`lib/discoverPaging.ts`).

Algorithm (per media type, using only that type's ratings):
1. **Positives** = rating ≥ 2, ordered by rating desc (ties in database order). **Seeds** = first 15.
2. **Genre taste**: each positive adds its weight (Love 3, Like 1) to each of its genres; **top 3
   genres** drive hidden gems. Every genre of every 👎 title goes into a "disliked genres" set.
3. **Tracks** (in parallel, `Promise.allSettled`, so one failed call doesn't fail the page):
   - A. `/recommendations` for all 15 seeds: +3 per Love seed, +1 per Like seed.
   - B. `/similar` for the first 10 seeds: (+2 Love, +1 Like) × 0.7.
   - C. Hidden gems (movies: `tmdb.discoverHiddenGems`): `discover` in any of the top 3 genres
     (OR), ★ ≥ 6.8, 150–4,000 votes, sorted by vote average: +1.5 each.
   Scores **add up across seeds**: a title several seeds point at wins (this "consensus" is the
   main reason it works).
4. **Bonus/penalty**: +2 if ★ ≥ 7.0 and 150–2,999 votes ("good, not over-seen"); −0.5 per genre in
   the disliked set.
5. **Filters**: every title on the user's list in any status (incl. Not for me) is excluded; no
   poster → excluded.
6. **Rank**: score desc, popularity tiebreak, top 50. Deterministic (no randomness).

Fallbacks:
- Movies: no positive rating → `{ results: [], personalized: false }`; the client then calls the
  contextual feed (spot 2). The client also falls back when fewer than 6 results come back.
- TV: no positive rating → trending TV.

TMDB cost (cold, per media type, per page): 15 + 10 + 1 = **26 calls**, cached by URL
(recommendations/similar 24 h, hidden gems 1 h).

### 2. Contextual feed (new users on Discover)

- Route: `app/api/movies/contextual/route.ts` + `lib/contextualFeed.ts` (#187).
- No 👍/♥ movie → trending. Otherwise time-of-day genre slot (client sends `?hour=`) via
  `getByGenre`, where a comma-joined genre list means AND (all 3 genres). The client shuffles the
  page randomly.
- Movies only. TV has its own trending fallback (spot 1).

### 3. What to Watch, "Just me" mood picks

- Route: `app/api/mood-picks/route.ts`; logic `lib/moodPicker.ts`, traits `lib/traits.ts`;
  UI `app/(main)/what-to-watch/page.tsx`, `components/mood/MoodControls.tsx`.
- **Uses no ratings at all.** Candidates are popular `discover` results filtered by the mood (vibe →
  genres, runtime, era, services, media type): 4 pages per type, ★ ≥ 6.5, ≥ 300 votes (movies) /
  ≥ 150 (TV), plus up to 20 want-list titles per type checked against the mood.
- Score: `traitScore = 0.5 × quality + 0.5 × tone`. Quality is the TMDB vote average shrunk towards
  a 6.8 prior with 300 pseudo-votes; tone is how well the title's genre traits fit the vibe.
- Draw (`pickRecommendations` in `lib/moodPicker.ts`): tiers fresh want-list → fresh other → repeat want-list → repeat other,
  where "repeat" means already on screen; Efraimidis–Spirakis weighted draw (by `traitScore`)
  within each tier, so refreshes vary. The "fresh" mood toggle limits to releases from the last
  365 days (`FRESH_WINDOW_DAYS`) and drops the vote floor to 50.
- TV always excludes Kids, News, Reality, Soap, Talk (`TV_ALWAYS_EXCLUDED`); runtime ≥ 10 min.
- Eval: `docs/evals/mood-picker.md`.

### 4. Watch together: "Tonight for you both" (pair)

- Pool: `lib/pairPool.ts` (`buildPairPool`), loaded by `lib/pairPoolLoader.ts`; route
  `app/api/watch-together/[userId]/picks`. UI `components/watch-together/TonightForYouBoth.tsx`,
  `PairCard.tsx`.
- Taste: `lib/pairTaste.ts`. Each entry gives a signal (Love 1.0, Like 0.6, Dislike −1.0, plus
  status signals); signals are spread over **genre traits** from `lib/traits.ts`; per-trait mean
  with a prior of 2; `affinity` = mean trait weight → `0.5 + 0.5·tanh(1.5·mean)`, shrunk towards 0.5
  until 10 signals; on own want list → at least 0.8.
- Sources: A. titles both want; B. one-sided wants (≤ 15 per person); C. TMDB `/recommendations`
  from Loves (3 seeds per person + 3 joint, ≤ 8 calls, pool 40), ranked by how many people's Loves
  led there; D. the mood picker's popular discover (4 pages, pool 80).
- Score: `pairScore = 0.45·pairFit + 0.35·traitScore + 0.2·sourceBoost`, with
  `pairFit = 0.7·min + 0.3·mean` (least misery). Pool capped at 100. Details budget 30
  (`FACTS_SHARES`).
- Draw: `lib/pairPicks.ts`, 12 cards, weight `0.05 + rank²`, max 3 per seed.
- Shelves (`lib/watchTogetherShelves.ts`) are list-based, not recommendations; their `freshSeeds`
  feed the pair seeds.
- Eval: `docs/evals/watch-together.md`. Known failures and fixes F1–F8:
  `docs/research/watch-together-matching.md`. Build: #196 (quick wins), #197 (on-topic recs,
  taste-led fill), #198 ("Why this?").

### 5. Decide (pair voting)

- `app/api/decide/*`, `lib/decide.ts`. Uses the same pair pool as spot 4, but **freezes the top 30
  by score** as 3 rounds × 10 (no random draw). Votes: no / yes / really want; `pickForUs` resolves
  a round. So every pair-pool fix lands here too, and so does every pair-pool bug.

### 6. "More like this" (detail modal)

- `app/api/{movies,tv}/[id]/recommendations/route.ts`; UI `components/movies/MovieDetailModal.tsx`,
  `components/tv/TVShowDetailModal.tsx`; spec `docs/specs/more-like-this.md`.
- TMDB `/recommendations`; if < 6 results, top up from `/similar` and dedupe; max 12. **No
  personalisation**; titles already on the list are shown (with a badge), by design.

### 7. Onboarding

- `app/api/onboarding`, curated ids in `lib/onboarding.ts`. Each chosen movie becomes WATCHED +
  Love, so it immediately seeds spots 1 and 4. Movies only, so a new user's TV Discover stays on
  trending.

## Caching and TMDB budget

- All TMDB calls go through `lib/tmdb.ts` using Next.js `fetch` caching: lists and discover
  1 h (`revalidate: 3600`), recommendations / similar / details 24 h (`revalidate: 86400`). The cache
  key is the URL, so two spots share a cached call only when they ask for the identical URL
  (same id, page, params).
- Our routes themselves are not cached; each request re-scores.
- Cold per-request worst cases: Discover 26 per type per page; pair ≤ 8 recs + 8 discover + ≤ 30
  details; mood ≤ 8 discover + ≤ 40 want checks; More like this ≤ 2.
- TMDB's soft limit is about 40 requests/second and may change; handle 429s
  (https://developer.themoviedb.org/docs/rate-limiting). `lib/concurrency.ts` limits bursts (pair
  loader uses 6).

## Known failure modes

From #193 (owner + Laura, live, 2026-11-28) and code reading:

| # | Failure | Where | Cause |
|---|---|---|---|
| K1 | If I Stay, Creed III "because you both loved The Social Network" | pair | TMDB `/recommendations` is co-viewing noise; kept with no check it resembles the seed (F1) |
| K2 | MobLand, The Shadow's Edge, Minions & Monsters ("random") | pair | taste-blind popular discover fill (F5); no kids/language negatives (F3) |
| K3 | Drama matches everything, dislikes averaged away | pair | genre-only traits, mean (F2) |
| K4 | Draw reaches the bottom of a 100-title pool | pair | `0.05 + rank²` over 100 (F6) |
| K5 | Want-list titles scored as mediocre | pair | no vote data on want candidates (F8) |
| K6 | `/similar` "agrees" across unrelated seeds | Discover, More like this | near-identical lists for many seeds (F7); consensus credit is spurious |
| K7 | Just me ignores everything you've rated | mood | no taste input |
| K8 | Same ratings, four different taste models | all | Discover genre counts, pairTaste traits, mood tone, none in More like this |
| K9 | Out-of-range ratings count as Likes | Discover | `rating ≥ 2` with no clamp |
| K10 | New user's TV Discover is plain trending | Discover TV | onboarding is movies-only; no TV contextual feed |

## Owner feedback so far

- 2026-11-28: Discover "Recommended for You" **works very well** (keep its behaviour).
- 2026-11-28 (#193): good pair picks **Trumbo**, **Beautiful Boy**; bad: **MobLand** (Laura
  wouldn't like it), **If I Stay**, **Creed III** (unrelated to The Social Network in style, story
  or quality), **Minions & Monsters** (random), **The Shadow's Edge** (horrible pick for them).
- Owner decisions (#196): drop off-seed recommendations; kids' animation off by default unless
  someone rated it; 12 recommendation calls for pairs; no keywords column yet.
- Standing rule: the movies/TV mix must come from shared traits (time, tone, quality), never from
  quotas.
- The owner and Laura have offered to be testers (see the tester loop in the engine spec).
