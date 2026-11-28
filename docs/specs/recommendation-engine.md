# Spec: one recommendation engine

Issue #199. Reference for today's behaviour: `docs/recommendations.md`. Pair research:
`docs/research/watch-together-matching.md` (#193).

## Problem & goal

Seven spots recommend titles (Discover, contextual feed, Just me mood picks, Tonight for you both,
Decide, More like this, onboarding), and each has its own logic and its own idea of taste. The same
ratings mean different things in each spot, so a fix in one place (e.g. #193's pair fixes) doesn't
reach the others, and the spot the owner likes best (Discover) shares nothing with the rest.

**Goal:** one shared module that every spot calls with a small preset. Each person has one taste
profile; candidates come from a shared set of sources; one scorer, one set of filters, one draw,
and one "Why this?" builder. Discover keeps behaving exactly as it does today until the owner and
Laura's labels say a change is better.

For: the owner, Laura and every signed-in user. What changes for them, in order:
1. Nothing visible at first (Discover extracted unchanged).
2. Watch together picks get #193's fixes, built once, on the engine.
3. Every pick can say why it's there.
4. Just me picks start using your ratings.
5. More like this is re-ordered for you.
6. Testers can tap "good pick / bad pick", and those labels become the eval set.

## Scope / non-goals

In scope: `lib/reco/` engine, presets for every spot above, a unified eval harness on frozen TMDB
fixtures, the tester loop (feedback table + one-tap control + self-export).

Non-goals (later):
- Keyword/theme column in the database (#193 decision 2: after Phase 1 ships).
- Machine-learned weights or embeddings. Weights stay hand-set and eval-tuned.
- Cross-media seeds in Discover (a loved movie seeding TV recs). Possible later preset option;
  not on by default because the owner likes Discover as is.
- Caching our own route results (TMDB fetch cache is enough for now).
- Changing any UI except the "Why this?" line and the tester control.

## Architecture

```
lib/reco/
  profile.ts      Person → TasteProfile (ratings clamped 1–3, statuses, seeds, genre weights,
                  traits, disliked genres, languages, exclusions)
  sources/        each returns Candidate[] with provenance, all via injected fetchers
    recs.ts       /recommendations per seed (Discover track A)
    similar.ts    /similar per seed (track B, optional, weight configurable)
    gems.ts       hidden gems in top genres (track C)
    tasteDiscover.ts  taste-led discover pages (#193 F5)
    moodDiscover.ts   popular discover filtered by a mood (today's moodPicker params)
    wants.ts      want-list titles (one person's or both)
    trending.ts / contextual.ts   cold start
  score.ts        consensus (sum of seed weights, optionally distinct-seed only), quality bonus,
                  disliked-genre penalty, trait affinity, pair combine (least misery), mood fit
  filters.ts      exclude list entries, poster, vote floor, seed relevance (F1), kids/language (F3),
                  mood constraints (runtime, services, era)
  draw.ts         rank (deterministic top N), weighted draw (rank² / E–S tiers), per-seed cap
  why.ts          reason + "Why this?" lines, privacy rules from #193 §"Why this?"
  budget.ts       per-request TMDB call budget; sources stop when it's spent
  presets.ts      discover | contextual | mood | pair | decide | seedTitle
  index.ts        recommend(preset, input, deps) → { picks, debug }
  fixtures/       frozen TMDB responses + personas + labels (no production data)
  eval.test.ts    runs every preset over the fixtures
```

Rules:
- Pure where possible: `recommend()` takes people (already loaded from the DB) and a `fetchers`
  object, so tests pass fakes and never hit TMDB or the database (CLAUDE.md Testing).
- One loader (`lib/reco/load.ts`) turns a user id into a `Person`, replacing the copies in the
  Discover routes and `lib/pairPoolLoader.ts`.
- Every candidate carries provenance (`source`, `seedIds`, per-person scores) so `why.ts` and the
  tester loop can record exactly why it was shown.
- Routes become thin: auth → validate → load → `recommend(preset)` → serialise. Response shapes
  stay the same, so the UI needn't change in the migration steps.

### Presets

| Preset | Replaces | Sources | Score | Draw |
|---|---|---|---|---|
| `discover` (movie/tv) | `app/api/{movies,tv}/recommended` | recs (15 seeds ×3/×1), similar (10 seeds ×0.7), gems | today's Discover formula, unchanged | deterministic top 50 |
| `contextual` | `app/api/movies/contextual`, TV trending fallback | trending / time-slot | none | client shuffle (unchanged) |
| `mood` | `app/api/mood-picks` | moodDiscover + wants; **later** + recs from Loves that fit the mood | `traitScore`; later + affinity | E–S tiers (unchanged) |
| `pair` | `lib/pairPool.ts` | wants (both/one), recs (6 seeds per person, distinct-seed consensus, ≤ 12 calls), tasteDiscover | F2 affinity, least misery, agreement only across different seeds | top 36, rank², ≤ 3 per seed |
| `decide` | pair pool in `app/api/decide` | as `pair` | as `pair` | frozen top 30 (unchanged) |
| `seedTitle` | `app/api/{movies,tv}/[id]/recommendations` | recs for one title, similar top-up if < 6 | TMDB order; later re-ranked by affinity | top 12 (list titles badged, not excluded) |

### What we keep from Discover (owner likes it)

- Seeds = positives, Loves first, up to 15; Love ×3, Like ×1.
- **Consensus**: scores add up across seeds. It's the core of why Discover works.
- The "good, not over-seen" bonus (+2 for ★ ≥ 7, 150–2,999 votes) and hidden gems.
- Exclude the whole list; deterministic ranking with popularity tiebreak.
- `Promise.allSettled`: a failed seed call never fails the page.

The `discover` preset reproduces today's output exactly (golden tests, task 1). Changes to it are
opt-in flags, each turned on only when the tester labels show it helps: clamp out-of-range
ratings (K9, a bug fix, on from task 1 with a test), seed relevance, `/similar` weight, stable tie
order.

### What we keep from #193 (pair fixes)

F1 seed relevance (drop off-seed recs, owner decision 1), F2 informative traits (Drama
down-weighted, a strong dislike caps affinity), F3 kids/language negatives (owner decision 3), F5
taste-led discover in place of the popular fill, F6 draw from the top 36, F8 want-list vote data,
the "Why this?" privacy rules, and the 12-call budget (decision 4). In the engine these are
filters and score options, so other presets can adopt them later on evidence.

### ADR: build #197 on the engine?

Options:
1. Build #196, #197, #198 as planned in `lib/pairPool.ts`, then port to the engine later.
2. **Build #196 as planned; re-scope #197 and #198 onto the engine.**
3. Pause all pair work until the engine is done.

**Recommendation: option 2.** #196 is small, touches only pair files, and gets the owner and Laura
better picks now. #197 is the big one: it adds Discover-style consensus, seed relevance and
taste-led discover, which are exactly the engine's `recs`, `filters` and `tasteDiscover`. Building
them inside `pairPool.ts` would create an eighth copy of Discover's logic and then need porting.
#198's "Why this?" is the engine's `why.ts`. The cost is that #197 waits for task 1 (the Discover
extraction), which is one mechanical PR.

## UX flow

Migration steps change no UI. New UI is limited to:

1. **"Why this?" line** (pair first, then other presets): small text under the card's reason, e.g.
   "Because you both loved The Social Network · Why this? True story, legal drama". Fallback to the
   reason alone. Empty/loading/error states are the card's existing ones.
2. **Tester control** (testers only): on recommendation cards in Discover, Just me, Tonight for you
   both and More like this, a compact 👍/👎 "Good pick / Bad pick" pair. Tap = saved (filled
   state); tap again = undo; after "Bad pick", optional chips: "Not my taste", "Seen it",
   "Random", "Wrong for us" (pair). Error: revert the state and show the existing toast. The
   designer decides placement after #190's poster card lands (it changes `components/ui/PosterCard.tsx`).
3. **Test round page** (testers only, later): `/labs/rate` shows 12 picks from a chosen preset
   (Discover movies/TV, Just me with a mood, Tonight for you both with a partner), each with the
   tester control, plus a "Done" that stores the round. "Rate these 12 picks" takes two minutes.
4. **Download my labels** (testers only), on the profile page: downloads a JSON file (below).

## Data model changes

New table, applied with `prisma db push` on the dev host (`ep-royal-tooth-…`) by the worker; the
owner applies it to production when the PR merges (the Vercel build doesn't push schema).

```prisma
model RecoFeedback {
  id        String    @id @default(cuid())
  userId    String    @map("user_id")
  mediaType MediaKind @map("media_type")   // existing enum
  tmdbId    Int       @map("tmdb_id")
  surface   String                         // "discover" | "mood" | "pair" | "decide" | "more_like_this" | "round"
  verdict   Int                            // 1 good, -1 bad
  reason    String?                        // one of the fixed chips
  context   Json?                          // preset, source, seedIds, partner present (bool), rank, why line
  roundId   String?   @map("round_id")
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, surface, mediaType, tmdbId])
  @@index([userId])
  @@map("reco_feedback")
}
// User: add `recoFeedback RecoFeedback[]`
```

`MediaKind` is the existing `MOVIE | TV` enum (also used by Decide); the API maps "movie"/"tv" to it.
`context` never stores the partner's id or ratings, only `partner: true`.

**Signal use:** a "Bad pick" excludes that title from the same tester's future recommendations on
every surface (like a soft Not for me, but it doesn't touch the list). It does **not** change the
taste profile, so the labels stay a clean eval set. "Good pick" is eval-only.

## API changes

- `POST /api/reco-feedback` body `{ mediaType, tmdbId, surface, verdict: 1 | -1, reason?, context?, roundId? }`
  → upsert on `(user, surface, mediaType, tmdbId)`. `DELETE /api/reco-feedback` same keys → undo.
- `GET /api/reco-feedback/export` → the caller's own labels plus their own rated titles, as JSON.
- `GET /api/reco/round?preset=…&partnerId=…` (later) → 12 picks for a round, same shapes as the
  existing routes.
- Existing routes keep their request and response shapes. Pair picks gain an optional
  `why: string | null`.

Auth: all require a session. Feedback and export routes require the caller to be a tester:
`RECO_TESTER_EMAILS` (comma-separated, server-only, compared case-insensitively to the session
email). Add it to `.env.example` and to Vercel Production and Development (`vercel env add`).
Non-testers get 404 so the feature isn't advertised.

## Security notes

- Request bodies are untrusted: zod schemas, `surface`/`reason` from fixed enums, `tmdbId` a
  positive int, `context` a strict object (known keys, strings ≤ 200 chars, arrays ≤ 20), whole
  body ≤ 4 KB. Cap 5,000 rows per user.
- A user can only read, write and export their own rows; `userId` always comes from the session.
- Pair `why` lines and feedback `context` follow #193's privacy rule: only the source and the
  candidate's themes shared with a **named Love/Like**; never dislikes, Not for me, weights or
  affinity, and never the partner's data in someone else's export.
- Export: titles, TMDB ids, the tester's own ratings, their labels and context. No emails, user ids,
  password hashes or other people's data. The tester downloads it themselves from production
  (owner-run, in their own browser); agents never touch production. The file goes into the repo
  only after the owner reviews it (`lib/reco/fixtures/labels/<persona>.json`, persona named
  "owner"/"laura", or anonymised if the owner prefers).
- TMDB responses are untrusted data; fixtures store only the fields the engine reads.

## Tester loop

1. Testers (owner, Laura) use the app normally; the 👍/👎 control on recommendation cards records
   judgements with the full provenance. Occasionally, a test round ("rate these 12 picks") gives
   balanced labels per preset.
2. When a round of feedback is in (or the owner asks), each tester taps **Download my labels**.
   The file holds: their rated titles (id, type, title, rating), and their labels (id, type,
   title, surface, verdict, reason, preset, seed ids, rank). That's "titles + labels", nothing else.
3. The owner attaches the files to a "labels" issue/PR. A worker runs
   `scripts/reco/build-fixtures.ts` (dev TMDB key) to freeze the TMDB responses the engine needs
   for those seeds and labelled titles into `lib/reco/fixtures/`.
4. `lib/reco/eval.test.ts` runs each preset on each persona and checks: bad-labelled titles appear
   ≤ a threshold per draw, good-labelled titles are kept, plus the six existing pair personas in
   `docs/evals/watch-together.md` and the mood eval cases. The thresholds become the regression
   gate in CI.
5. Any proposed engine change (e.g. turning on seed relevance for Discover) must improve the
   eval's numbers without breaking the golden or labelled cases. Results go in
   `docs/recommendations.md` ("Owner feedback").

## Open questions for the owner

1. **Testers by email allowlist** (`RECO_TESTER_EMAILS` in Vercel) — fine, or would you rather a
   per-user switch in the database? Recommendation: email allowlist, no schema change on `User`.
2. **"Bad pick" hides the title for you** (on every surface, until undone). OK? Alternative: label
   only, keep showing it.
3. **Export includes your ratings** (title + ♥/👍/👎), not only the labels, so the fixtures can
   rebuild your taste. OK? Without it, fixtures stay synthetic personas.
4. **Persona names in the repo**: "owner" and "laura", or anonymous ("tester-a/b")? The repo is
   public. Recommendation: anonymous.

## Task breakdown

Order matters: each task is one PR. Files listed to avoid parallel conflicts. All workers run
tsc/lint/test (and e2e where UI changes).

**Task 1 — Extract Discover into `lib/reco/` unchanged.** Golden tests first: freeze fixtures for
2 personas (movie + TV) and assert today's routes' exact output; then move the logic into
`lib/reco/{profile,sources/recs,sources/similar,sources/gems,score,filters,draw,presets,index,load}.ts`
with the `discover` preset; both routes become thin and share one implementation. Plus the K9
clamp with its own failing-first test.
- Done when: golden tests pass on old and new code; `/api/{movies,tv}/recommended` return
  identical results for a dev test user (verifier compares before/after JSON); routes ≤ 40 lines.
- Files: `lib/reco/**`, `app/api/movies/recommended/route.ts`, `app/api/tv/recommended/route.ts`.
- After: none. Model: Sonnet (mechanical, golden-tested). Reviewer.

**Task 2 — #196 as planned (pair quick wins).** Unchanged scope, in `lib/pairPool.ts`,
`lib/pairTaste.ts`, `lib/pairPicks.ts`.
- After: none (parallel with task 1; no shared files). Model: Sonnet.

**Task 3 — Unified eval harness.** Move pair + mood fixtures under `lib/reco/fixtures/`, add
`lib/reco/eval.test.ts` running presets over personas, add `scripts/reco/build-fixtures.ts` (dev
TMDB key, writes trimmed JSON). Existing evals keep passing; docs/evals link to it.
- Done when: `npm test` runs the eval for discover + pair + mood; the build script regenerates the
  fixtures byte-identically for the same TMDB data.
- Files: `lib/reco/fixtures/**`, `lib/reco/eval.test.ts`, `scripts/reco/**`, `docs/evals/*`.
- After: tasks 1, 2. Model: Sonnet.

**Task 4 — Pair preset on the engine (re-scoped #197).** #197's scope (seed relevance, taste-led
discover, distinct-seed consensus, 6 seeds/person, ≤ 12 calls, no `/similar`) built as engine
sources/filters/score options; `pair` and `decide` presets; `lib/pairPool.ts` reduced to a
wrapper or removed; `lib/pairPoolLoader.ts` replaced by `lib/reco/load.ts`.
- Done when: #197's "Done when" on the eval (owner's bad picks 0 per draw, good kept); Tonight
  for you both and Decide work on the preview for two test users; Discover golden tests unchanged.
- Files: `lib/reco/**`, `lib/pair*.ts`, `app/api/watch-together/[userId]/picks/route.ts`,
  `app/api/decide/**`.
- After: tasks 1, 2, 3. Model: **Opus** (design decisions). Reviewer + verifier.

**Task 5 — "Why this?" on pair picks (re-scoped #198)** via `lib/reco/why.ts`.
- Done when: #198's "Done when"; test proves dislikes never appear; verifier at 390 px + desktop.
- Files: `lib/reco/why.ts`, `components/watch-together/PairCard.tsx`.
- After: task 4. Model: Sonnet. Reviewer + verifier.

**Task 6 — Feedback table and API.** `RecoFeedback` model (dev `db push`), `POST/DELETE
/api/reco-feedback`, `GET /api/reco-feedback/export`, tester allowlist helper
(`lib/recoTesters.ts`), `RECO_TESTER_EMAILS` in `.env.example`; "Bad pick" exclusion read by
`lib/reco/load.ts`.
- Done when: route tests cover auth, non-tester 404, validation, own-rows-only, upsert/undo,
  export contents (no ids/emails); dev test rows cleaned up.
- Files: `prisma/schema.prisma`, `app/api/reco-feedback/**`, `lib/recoTesters.ts`,
  `lib/reco/load.ts`, `.env.example`.
- After: task 1. Model: Sonnet. Reviewer + **security review**.

**Task 7 — Designer: tester control + test round page.** Starting from real screenshots of the
#190 card. Output: placement, states (idle, saved, chips, error) at 390 px and desktop.
- After: #190 merged. Role: designer.

**Task 8 — Tester control on cards.** Build task 7's design on Discover, Just me, Tonight for you
both, More like this; only for testers; sends provenance from the engine's `debug`.
- Done when: a tester sees and uses it on all four surfaces; a non-tester sees nothing; e2e smoke
  covers one tap + undo.
- Files: `components/ui/PosterCard.tsx` (or the new control component), card callers.
- After: tasks 6, 7. Model: Sonnet. Reviewer + verifier.

**Task 9 — Mood preset on the engine, then personalised.** Step 1: move `lib/moodPicker.ts` +
route into the `mood` preset unchanged (golden tests). Step 2 (flagged, eval-gated): add recs from
the person's Loves that fit the mood, and affinity in the score (K7).
- Done when: golden tests pass; with step 2 on, the mood eval holds and a persona's Just me picks
  include their rec titles that fit the mood.
- Files: `lib/moodPicker.ts`, `app/api/mood-picks/route.ts`, `lib/reco/**`.
- After: task 3 (and task 4 merged, to avoid `lib/reco` conflicts). Model: Opus for step 2.

**Task 10 — Seed-title and cold-start presets.** More like this and the contextual/trending
fallbacks on the engine, unchanged output; optional affinity re-rank for More like this behind a
flag; a TV cold start that uses movie onboarding picks' genres (K10).
- Files: `app/api/{movies,tv}/[id]/recommendations/route.ts`, `app/api/movies/contextual/route.ts`,
  `lib/contextualFeed.ts`, `lib/reco/**`.
- After: task 4. Model: Sonnet.

**Task 11 — Test round page + export button** (`/labs/rate`, profile "Download my labels").
- After: tasks 6, 7, 8. Model: Sonnet. Verifier.

**Task 12 — First labelled fixtures.** After the testers' first export (owner-run): build the
fixtures, set the eval thresholds, record results in `docs/recommendations.md`.
- After: tasks 3, 11 and the owner's export. Model: Opus.

Parallel lanes: {1, 2} → 3 → 4 → {5, 9, 10}; 6 after 1, in parallel with 3–5; 7 after #190.
