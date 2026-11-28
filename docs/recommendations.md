# How recommendations work (WIP draft, planner #199)

Draft notes from reading the code. To be rewritten into the full reference, plus
`docs/specs/recommendation-engine.md`.

## Spots (verified in code, 2026-11-27)
- Discover "Recommended for You": `app/api/{movies,tv}/recommended/route.ts` (near-identical copies).
  Positive = rating ≥ 2, seeds = first 15 by rating desc (ties unordered). Tracks: `/recommendations`
  (♥×3, 👍×1), `/similar` first 10 seeds (♥×2, 👍×1, then ×0.7), hidden gems (top 3 genres by weighted
  count, ★6.8+, 150–4000 votes, sort vote_average.desc, +1.5). Bonus +2 if ★≥7 and 150–3000 votes;
  −0.5 per 👎 genre. Excludes every list entry (incl. Not for me). Top 50, popularity tiebreak, paged.
  Movie taste uses movie ratings only; TV only TV. Movies: < 6 results → contextual fallback (client).
  TV: no positive ratings → trending TV. Out-of-range ratings (e.g. 999) count as 👍 here (F5).
- Contextual fallback: `app/api/movies/contextual`, `lib/contextualFeed.ts`. No 👍/♥ movie → trending;
  else time-slot genres via `getByGenre` (comma = AND of 3 genres). Client shuffles the page randomly.
- Mood picks (Just me): `app/api/mood-picks`, `lib/moodPicker.ts`. **Uses no ratings at all**: popular
  discover (4 pages/type, ★6.5, 300/150 votes) + want-list checks (≤20/type). traitScore = 0.5 quality
  (shrunk, prior 6.8/300) + 0.5 tone. Client tiers: fresh want → fresh other → repeats; E–S weighted draw.
- Pair (Tonight for you both) + Decide: `lib/pairPool.ts` via `lib/pairPoolLoader.ts`; taste
  `lib/pairTaste.ts` (genre traits from `lib/traits.ts`, mean, shrinkage, least misery), draw
  `lib/pairPicks.ts` (0.05 + rank², seed cap 3). Decide freezes top 30 as 3×10 rounds (no draw).
  Failure modes + fixes F1–F8: `docs/research/watch-together-matching.md`; #196/#197/#198 open, no PRs yet.
- More like this: `app/api/{movies,tv}/[id]/recommendations` — TMDB recs, `/similar` top-up if < 6, 12 max,
  no personalisation (spec says show list titles with a badge).
- Onboarding: `app/api/onboarding` — curated ids → WATCHED + rating 3 (Love), movies only.
- Shelves (`lib/watchTogetherShelves.ts`) are list-based, not recommendations; `freshSeeds` feeds pair seeds.
- Signals: rating 1 👎 / 2 👍 / 3 ♥; status WANT_TO_WATCH / WATCHING (TV) / WATCHED / NOT_INTERESTED.
  #190 proposes dropping "Not for me" from the card: weaker negative signal, flag it.

## Plan so far
- Engine: `lib/reco/` (profile → sources → score → filters → draw → why), presets solo-discover,
  solo-mood, pair, seed-title, cold. First step = extract Discover unchanged (golden tests).
- #196 lands as is; #197 re-scoped onto the engine (pair preset), #198 on the engine's why module.
- Tester loop: `RecoFeedback` table (dev-clean), testers by env allowlist of user ids, one-tap
  good/bad on rec cards (designer first, avoid #190 files), self-export of own labels (titles + labels),
  frozen-TMDB fixtures so the eval runs in Vitest.
