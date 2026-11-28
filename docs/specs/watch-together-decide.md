# Spec: Watch Together — settle "what do we watch tonight?"

Issue: #14 · Builds on: the mood picker (#12, `lib/moodPicker.ts`) and the dev database (#6) · Status: **draft for owner review**

## 1. Problem and goal

Two people who live or watch together (a partner, a family member, a friend) lose the evening scrolling and arguing. Each knows what *they* fancy; nobody knows what *both* will enjoy, and whoever gives in first picks.

**Goal:** in under two minutes, two connected people get one title they'll **both** enjoy tonight, on a service they can watch it on, and both feel the choice was fair.

What changes for them:
- **Tonight for you both:** the Watch Together page leads with 12 picks ranked for the pair, under the same mood controls as "What to Watch". It covers movies *and* TV, not just movies as the page does today.
- **Decide together:** one person starts a quick vote, each votes privately on their own phone on the same shortlist of 10, and the app reveals the match. If there's no match, it offers another round or picks for them.

Success measures are in §9.

## 2. What exists today

| Piece | Where | Notes for this feature |
|---|---|---|
| Connections | `UserConnection` (PENDING/ACCEPTED), `app/api/connections/*`, Profile → Friends | Accept by addressee only (checked). Spam and email-oracle issues: security F6, F7. |
| Watch Together page | `app/(main)/watch-together/[userId]/page.tsx`, `app/api/watch-together/[userId]/route.ts` | **Movies only** (ignores `TVWatchlistEntry`). Sections: Both want to watch, friend loved, I loved (the "fresh picks" shelf is gone: its seeds now feed Tonight, §5.2). Checks for an ACCEPTED connection (403 otherwise). Returns the friend's email. |
| Mood picker | `lib/moodPicker.ts`, `app/api/mood-picks/route.ts`, `app/(main)/what-to-watch/page.tsx` | `moodToDiscoverParams`, `matchesDiscoverParams`, `filterByRealRuntime`, `traitScore`, `blendPools`, `pickRecommendations`. Already written to be reused here. |
| Ratings | `rating` on both watchlist tables | 1 = Didn't like, 2 = Like, 3 = Love (`components/ui/ThumbRating.tsx`). **Not range-checked on PATCH (F5)**, so values like 999 exist and must be treated as unknown. |
| Onboarding picks | `app/api/onboarding/route.ts` | Stored as `WATCHED` + `rating: 3`, so they already count as Loves. |
| Cached genres | `Movie.genres`, `TVShow.genres` (JSON, TMDB `{id,name}[]`) | Lets us build a taste profile with **no TMDB calls**. |
| Streaming services | `User.streamingServices` (canonical ids, `lib/providers.ts`) | Region is hard-coded to US, as in the mood picker. |
| Design kit | "Cinema dark" (`docs/reviews/design.md`): PosterCard v2 (#76), states kit (#79), Dialog/bottom sheet (F5, no issue yet; `ResultFilters.tsx` has a working sheet) | Use them when merged; fall back to `MovieCard`/`TVShowCard` and the `ResultFilters` sheet pattern until then. |

## 3. Scope and non-goals

**In scope (v1)**
- A shared taste model and pair ranking, movies and TV in one catalogue.
- "Tonight for you both" picks on the Watch Together page (no schema change).
- A two-phone decide session: shortlist of 10, private votes, reveal, fallback.
- A quality eval for "would both like this".

**Non-goals (later, see §11)**
- Groups of 3 or more.
- A same-device "pass the phone" mode (pending owner answer, Q1).
- Each person picking their own mood and combining them.
- Push or email invites; real-time sockets.
- Learning from decide votes into the taste profile.
- "Continue a show you're both watching".
- Non-US regions.
- Any AI or LLM ranking. The model stays deterministic and unit-testable.

## 4. Product rule: one catalogue, judged by traits

From the owner, and it applies to every part of this spec:

- Movies and TV are **one catalogue**. Every candidate is scored on the same traits: **time available** (runtime or episode length, a hard filter), **tone** (genre fit to the mood) and **quality** (vote-shrunk rating), plus, here, **pair fit**.
- There is **no quota, no alternation and no per-type slot** anywhere: not in the pool, the 12 picks, the shortlist of 10 or the fallback.
- A person's taste is stored as **traits, not types**. A Love for *Arrival* (a movie) raises sci-fi and drama, and so lifts *Severance* (TV) as much as another film. Movie and TV genre ids are mapped onto one shared trait vocabulary (§5.1) so this works.
- The movie/TV split of what we show is an **outcome we report in the eval**, never a target.

## 5. Decisions

Each decision lists the options and the recommendation. The big ones are also recorded as ADRs in §10.

### 5.1 Taste model

**Signals per person, per title** (movies and TV alike):

| Signal | Weight | Why |
|---|---|---|
| Love (rating 3; includes onboarding picks) | +1.0 | strongest positive |
| Like (rating 2) | +0.6 | |
| Watched, unrated | +0.2 | they chose to watch it; weak |
| Want to watch | +0.4 | intent, not experience |
| Watching (TV) | +0.4 | |
| Didn't like (rating 1) | −1.0 | |
| Not interested | −0.6 | a rejection, often without seeing it |
| Any other `rating` value (F5 junk, e.g. 999) | ignored | never trust out-of-range data |

**Shared trait vocabulary** (`lib/traits.ts`): TMDB movie and TV genre ids map to one set of string traits, so taste crosses types. For example, TV `10759 Action & Adventure` → `action` + `adventure`, TV `10765 Sci-Fi & Fantasy` → `scifi` + `fantasy`, TV `10768 War & Politics` → `war`, movie `10751` / TV `10751` / TV `10762` → `family`. Genres with no TV equivalent (Thriller, Horror) stay as traits; TV titles simply never carry them.

**Profile:** for each trait `t`, `w[t] = Σ signal / (n_t + 2)` over the person's titles that carry `t`. The `+2` shrinks traits seen only once or twice towards 0. Genres come from the cached `Movie.genres` / `TVShow.genres`; titles without cached genres are skipped.

**One person's predicted affinity for a candidate**, 0–1:
1. Trait affinity: `0.5 + 0.5 × tanh(1.5 × mean(w[t] for t in candidate's traits))`.
2. Direct signals override: on their want list → at least 0.8. Not interested or watched → the title is excluded (§5.2), so it is never scored. A TV show someone is *watching* counts like want-to-watch (0.8 floor, source boost below).
3. **Little data:** confidence `c = min(1, signals / 10)`; `affinity = 0.5 + c × (affinity − 0.5)`. A person with no history is neutral (0.5): they neither drag a title down nor push it up, so ranking leans on the other person plus quality. Fewer than 5 signals sets a `coldStart` flag, and the UI shows "Rate a few things you've seen so picks fit you both" with a link to My Movies. A "rate 10 quickly" flow is a later item.

**Blending two people.** Options:

| Option | How | Trade-off |
|---|---|---|
| Average | `(a + b) / 2` | One person's 0.95 hides the other's 0.2, which is exactly the "I'll put up with it" outcome we want to avoid. |
| Least misery | `min(a, b)` | Fair, but flat: it can't tell "both fine" from "one thrilled". |
| Veto | drop the title if either `< 0.3`, else average | Hard threshold; brittle with little data. |
| **Least-misery-weighted (recommended)** | `pairFit = 0.7 × min(a, b) + 0.3 × (a + b) / 2` | Mostly fair, still rewards a title one person is excited about. A standard group-recommender strategy (Masthoff, *Group Recommender Systems*). |

**Final score per candidate**, 0–1:
`score = 0.45 × pairFit + 0.35 × traitScore(c, mood) + 0.20 × sourceBoost`
- `traitScore` is the mood picker's existing quality + tone score, unchanged.
- `sourceBoost`: on both want lists = 1.0; on one want list = 0.5; TMDB rec seeded by both people's Loves = 0.6; seeded by one person = 0.3; discover only = 0.

These weights are starting points. The eval (§9) tunes them, and the tests pin the ordering properties, not the exact numbers.

### 5.2 Candidate sources

Every source returns movies **and** TV. Every candidate passes the **same mood filter**: `matchesDiscoverParams` with the params from `moodToDiscoverParams`, and for movies with a time limit, `filterByRealRuntime`. One source of truth for what a mood means.

| # | Source | Size cap | TMDB cost |
|---|---|---|---|
| A | **Both want to watch** (intersection of want lists) | all | one `getTitleMoodFacts` each (24 h cache) |
| B | **One person wants it**, the other hasn't seen it (union minus A) | 15 most recent per person | same |
| C | **TMDB recommendations** seeded from (1) up to 3 titles **both** people liked, Loves first (the old "Fresh Picks for Both of You" shelf), then (2) each person's 3 most recent Loves, alternating (movie seeds → `getMovieRecommendations`, TV seeds → `getTVRecommendations`). A title in both groups is one call. A joint seed counts as seeded by both people (source boost 0.6, same as a title recommended from both people's Loves); a title recommended from both people's seeds ranks higher. | top 30 by seed count | ≤ 8 rec calls in all (joint seeds first), then facts checks when time or services are on |
| D | **Mood discover**: the mood picker's pool (`moodToDiscoverParams` → `blendPools`), 2 pages per type | 40 | 4 discover calls |

C seeds by type, so a pair who mostly love films get more film recs. That's taste, not a quota, and D plus the cross-type trait profile keep the other type in play.

**Included:** a TV show either person is **watching** is treated like want-to-watch in A and B (one person = source boost 0.5, both = 1.0) and gets its own reason: "You're watching this", "Sam is watching this", "You're both watching this", or, when one is watching and the other wants it, "Sam is watching this, and it's on your list" / "You're watching this, and it's on Sam's list". Only the titles' list status is used, never a dislike (§5.5).

**Excluded, always:** any title either person has marked watched or not interested. One person's watch history is enough to drop a title: "I've seen it" ends most debates. Rewatches are out of scope.

**Streaming services.** Options:

| Option | Meaning | Fits |
|---|---|---|
| **Union (recommended default)** | on a service *either* of you has | People on one sofa with one TV, which is the main case. |
| Intersection | on a service you *both* have | Watching apart, each on their own TV. |
| Shared first | union, with shared services ranked higher | More complex to explain. |

Recommendation: the "On our services" toggle filters to the **union**. A second toggle, "Only services we both have", switches to the intersection. If only one person has saved services, their list is used and the card says "On Sam's Netflix". If neither has, the toggle is disabled with "Add your services in Profile". This needs no code beyond what exists: `with_watch_providers` with `|` already means "any of", and `canonicalProviderIds` / `providerTierIds` already handle tiers.

**Media type.** The pair flow has no Movies / TV / Both control. It is always one catalogue. Time available does the work: "~30 min" naturally yields mostly episodes.

### 5.3 The decision flow

Options:

| Option | How | Verdict |
|---|---|---|
| A. App just picks | "Tonight for you both": 5 ranked picks, Shuffle | **Ship first** (no schema). Good on its own, but no buy-in: one person still has to say yes. |
| B. **Two phones, private votes (recommended for the "settle it" moment)** | One person starts a session with a mood, both get the **same 10**, each votes privately, then reveal | Each vote is authenticated, votes are private until the reveal (no social pressure, which is the point), and it fits the app's one-account-per-phone model. |
| C. Pass the phone | Same as B on one device, two turns | Only one person is signed in, so the partner's votes aren't really theirs. Later, if the owner wants it (Q1). |
| D. Endless swipe until a match (dating-app style) | | Takes longer and tires people out. A fixed 10 keeps it under two minutes. |

**Recommended v1 flow (B), step by step**

1. **Start.** On the Watch Together page for Sam, tap **Decide together**. A bottom sheet opens with the mood controls (vibe, time, something new, on our services). Tap **Start**.
2. **Invite.** The session is created with a shortlist of 10 (and 20 more held for later rounds). The starter sees a **Share link** button (Web Share API, copy as fallback) and goes straight to voting. Sam sees a **Join** banner on the Watch Together page and Profile → Friends. Both are polled.
3. **Vote.** One card at a time: poster, title, year · runtime, the service it's on, and one "why" line ("On both your lists", "Because you both loved *Arrival*"). Three buttons that mirror the app's rating scale: **👎 No · 👍 Yes · ❤️ Really want**. On phones, swipe left or right too; keyboard ← / → / ↑. Voting can be paused and resumed; "Undo" goes back one card.
4. **Wait.** "Waiting for Sam… 6 of 10". Polled every 3 s. Sam's individual votes are never shown.
5. **Reveal.** A match is a title both voted Yes or Really want. The winner has the highest vote sum (Really want = 2, Yes = 1). Ties go to more Really-wants, then to the higher pair score. The screen shows the winner big, with where to watch and a trailer, plus "Also matched" (up to 2 runners-up). Actions: **Add to my list**, **Watch trailer**, **Done**.
6. **No match.** "No match this time." Primary: **Try 10 more** (round 2, from the held candidates; up to 3 rounds). Secondary: **Just pick for us**, which reveals the best-scoring held candidate neither person has voted No on.

**States**

| Screen | Loading | Empty | Error |
|---|---|---|---|
| Tonight for you both | 5 poster skeletons | "Nothing fits those moods on your services": a button to turn services off, and one to change the mood | ErrorState with Retry |
| Start sheet | Start button shows a spinner while the shortlist builds (≤ 5 s) | Fewer than 4 candidates: "Not enough for a vote. Try a different mood." | "Couldn't start. Try again." |
| Vote | Card skeleton | n/a (the shortlist is fixed) | Vote failed: card stays, toast "Couldn't save, retrying", and the vote is retried |
| Wait | progress bar | n/a | polling errors are silent; after 3 failures, "Reconnecting…" |
| Reveal / no match | n/a | n/a | n/a |
| Expired (6 h) or cancelled | n/a | "This vote has ended": **Start a new one** | n/a |
| Not your session / not connected | n/a | the standard 404 | n/a |
| Under 10 taste signals | note per person until they reach 10 (confidence `c` = 1): "You've rated 4 of 10 — rate a few more so picks fit you both. Go to My Movies"; for the partner "Sam has rated 2 of 10, so picks lean on your taste." The model's own <5 cold-start behaviour is unchanged. | | |

### 5.4 Data model

**Option chosen:** store the frozen shortlist as rows (ADR-4), so votes point at a real candidate and both phones see exactly the same list.

```diff
 model User {
   ...
   sentConnections     UserConnection[] @relation("ConnectionRequests")
   receivedConnections UserConnection[] @relation("ConnectionAddressees")
+  decideSessionsStarted DecideSession[]
+  decideVotes           DecideVote[]
   @@map("users")
 }

 model UserConnection {
   ...
   addressee   User @relation("ConnectionAddressees", fields: [addresseeId], references: [id], onDelete: Cascade)
+  decideSessions DecideSession[]

   @@unique([requesterId, addresseeId])
   @@map("user_connections")
 }

+enum MediaKind {
+  MOVIE
+  TV
+}
+
+enum DecideStatus {
+  OPEN       // voting in progress
+  MATCHED    // a winner was found
+  NO_MATCH   // current round ended with no match; can start the next round
+  PICKED     // "Just pick for us" was used
+  CANCELLED
+}
+
+model DecideSession {
+  id           String       @id @default(cuid())
+  connectionId String       @map("connection_id")
+  createdById  String       @map("created_by_id")
+  /// MoodSelection, validated with zod on write
+  mood         Json
+  status       DecideStatus @default(OPEN)
+  round        Int          @default(1)
+  winnerId     String?      @map("winner_id")   // DecideCandidate.id
+  createdAt    DateTime     @default(now()) @map("created_at")
+  resolvedAt   DateTime?    @map("resolved_at")
+  expiresAt    DateTime     @map("expires_at")  // createdAt + 6 h
+
+  connection UserConnection    @relation(fields: [connectionId], references: [id], onDelete: Cascade)
+  createdBy  User              @relation(fields: [createdById], references: [id], onDelete: Cascade)
+  candidates DecideCandidate[]
+  votes      DecideVote[]
+
+  @@index([connectionId, status])
+  @@index([createdById, createdAt])
+  @@map("decide_sessions")
+}
+
+model DecideCandidate {
+  id         String    @id @default(cuid())
+  sessionId  String    @map("session_id")
+  mediaType  MediaKind @map("media_type")
+  tmdbId     Int       @map("tmdb_id")
+  round      Int       // 1–3; round 1 is the first 10
+  position   Int       // order within the round
+  score      Float     // pair score at creation, for tie-breaks and "pick for us"
+  /// Snapshot so the vote screen needs no TMDB calls:
+  /// { title, posterPath, date, runtime, providerIds, reason }
+  snapshot   Json
+
+  session DecideSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
+  votes   DecideVote[]
+
+  @@unique([sessionId, mediaType, tmdbId])
+  @@index([sessionId, round])
+  @@map("decide_candidates")
+}
+
+model DecideVote {
+  id          String   @id @default(cuid())
+  sessionId   String   @map("session_id")
+  candidateId String   @map("candidate_id")
+  userId      String   @map("user_id")
+  vote        Int      // 0 = no, 1 = yes, 2 = really want (checked in code: 0–2)
+  createdAt   DateTime @default(now()) @map("created_at")
+  updatedAt   DateTime @updatedAt @map("updated_at")
+
+  session   DecideSession   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
+  candidate DecideCandidate @relation(fields: [candidateId], references: [id], onDelete: Cascade)
+  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
+
+  @@unique([candidateId, userId])
+  @@index([sessionId, userId])
+  @@map("decide_votes")
+}
```

- **Additive only:** three tables and two enums; no existing column changes.
- **Dev database:** yes. Apply with `prisma db push` against `dev-clean` (check `DATABASE_URL` is the `ep-royal-tooth-…` host first).
- **Production:** agents never touch it. The **owner** runs `prisma db push` against production after the schema PR merges and **before** the decide API PR merges. Until then no code queries the new tables, so the deploy is safe.
- **Unfriending** deletes the connection, which cascades to its sessions, candidates and votes. **Account deletion** cascades through `User`.
- Expiry is checked when a session is read (`expiresAt < now` → treated as ended). No scheduled job. Starting a session deletes the same pair's sessions older than 30 days, so the tables stay small.
- `vote` is an `Int` with range checking rather than an enum, to match how `rating` works. Either is fine; this keeps the scoring simple (`sum of votes`).

### 5.5 Privacy and consent

What each person can see of the other, through anything in this spec:

| Data | Visible to the partner? | Notes |
|---|---|---|
| Want-to-watch titles | Yes, as "On both your lists" / "On Sam's list" | Already shown by today's Watch Together page. |
| Loves and Likes | Indirectly, as "Because Sam loved *Arrival*" reasons | Today's page already shows "Sam loved". |
| Dislikes, not interested, the taste profile, affinity numbers | **Never** | Used server-side only. The API returns one `pairScore` per title, which can't be split back into two people. |
| Streaming services | Only the service a card is on ("On Sam's Netflix") | |
| Decide votes | **Never per title.** During voting: a progress count. After the reveal: only the matches. | The partner can infer that their own Yes titles that didn't match were someone's No. That's unavoidable and acceptable. |
| Email | **Not returned** by any new route | The existing route returns it; new routes return `{ id, name }` only. |

**Is an accepted connection enough consent?** Recommendation: **yes for v1**, because the existing feature already shares watchlists and loves with accepted friends. Add one line of disclosure where requests are sent and accepted: "Friends can see what's on your lists and what you've loved, and can start a Watch Together vote with you." If the owner wants a separate "share my taste" opt-in (Q3), that adds a column on `UserConnection` and a check in `requireConnection`.

### 5.6 API

All routes:
- require a session (`auth()`, 401 without one)
- resolve the other person **only** through `requireConnection(myId, otherId)`, a new helper in `lib/connections.ts` that returns the ACCEPTED `UserConnection` or `null`
- return **404** for "no such user", "not connected" and "not your session" alike, so ids can't be probed
- validate every query and body with **zod** (already a dependency), returning 400 on failure (F5)
- never take a user id from the client without that connection check; the session's participants come from its connection row, never from the request

**Slice 1: pair picks**

`GET /api/watch-together/[userId]/picks?vibe=&time=&fresh=&services=&sharedOnly=`
- Query parsed by `parseMoodSelection` (unknown values fall back to defaults), plus `sharedOnly=1` for the intersection of services. `media` is ignored: always both types.
- Response:
```ts
{
  partner: { id: string; name: string | null };
  pool: PairCandidate[];        // ≤ 60, ranked; the client draws 12 with a weighted shuffle (5 shuffles before a repeat)
  services: { mine: boolean; partners: boolean; shared: number[] }; // for toggle state
  coldStart: { me: boolean; partner: boolean };
  signals: { me: number; partner: number }; // taste signals, numbers only: drives "rated 4 of 10"
}
type PairCandidate = MoodCandidate & {
  pairScore: number;            // 0–1, final score from §5.1
  reason: string;               // one line, privacy-safe (§5.5)
  onMyList: boolean;
  providerIds?: number[];       // when known
};
```

**Slice 2: decide sessions**

| Method and path | Body / query | Does | Errors |
|---|---|---|---|
| `POST /api/decide` | `{ partnerId: string, mood: MoodSelection, sharedOnly?: boolean }` | Checks the connection. Cancels any OPEN session for this connection. Builds the pair pool (same code as `/picks`), takes the top 30 and stores them as rounds 1–3 of 10. Returns `{ id }`. | 400 invalid; 404 not connected; 422 "not enough candidates" if < 4; 429 if the user started ≥ 20 sessions in 24 h |
| `GET /api/decide?partnerId=` | | The OPEN, unexpired session with this partner, if any: `{ session: { id, createdBy: "me" \| "partner", createdAt } \| null }`. Used for the Join banner. | 404 not connected |
| `GET /api/decide/[id]` | | The session from the caller's point of view (below). Polled. No TMDB calls. | 404 if the caller isn't one of the two people |
| `PUT /api/decide/[id]/votes` | `{ candidateId: string, vote: 0 \| 1 \| 2 }` | Upserts the caller's vote. The candidate must belong to this session and the **current** round, and the session must be OPEN and unexpired. When both people have voted on every card in the round, resolves it (`MATCHED` or `NO_MATCH`) in the same transaction. | 400; 404; 409 if the session isn't open or the round has moved on |
| `POST /api/decide/[id]/next-round` | | NO_MATCH and round < 3 → `round + 1`, status OPEN. | 409 otherwise |
| `POST /api/decide/[id]/pick` | | NO_MATCH → picks the highest-`score` held candidate that neither person voted No on (falling back to the highest overall). Status PICKED. | 409 otherwise |
| `DELETE /api/decide/[id]` | | Either person cancels. | 404 |

`GET /api/decide/[id]` response:
```ts
{
  id: string;
  status: "OPEN" | "MATCHED" | "NO_MATCH" | "PICKED" | "CANCELLED" | "EXPIRED";
  round: number; maxRound: 3;
  partner: { id: string; name: string | null };
  mood: MoodSelection;
  candidates: Array<{ id: string; mediaType: "movie" | "tv"; tmdbId: number; title: string;
                      posterPath: string | null; date: string; runtime: number | null;
                      providerIds: number[]; reason: string }>;   // current round only
  myVotes: Record<string, 0 | 1 | 2>;                            // candidateId → vote
  partnerProgress: { voted: number; total: number };             // a count, never the votes
  result?: { winner: CandidateView; alsoMatched: CandidateView[]; bothReallyWant: boolean;
             picked: boolean };                                  // only once resolved
}
```

**Concurrency:** both people can cast their last vote at the same moment. The vote upsert and the "is the round complete?" check run in one `prisma.$transaction` at Serializable isolation, retried once on a conflict, so the round resolves exactly once. Resolution is a pure function (`resolveRound`), so retrying is safe.

## 6. Security notes

| Finding | How this spec respects it |
|---|---|
| **F1** unauthenticated TMDB proxies, quota | Every new route requires a session. TMDB calls happen only in `/picks` and `POST /api/decide`, are capped per request (§5.2: ≤ 8 rec calls, ≤ 4 discover calls, ≤ 30 facts lookups on a cold cache) and go through `createLimiter(6)`, mostly with a 24 h cache. Session creation is capped at 20 per user per day (counted from `decide_sessions`, no new infrastructure). Polling reads only the database. |
| **F5** input validation | zod schemas for the mood, `partnerId` (cuid string, ≤ 40 chars), `candidateId` and `vote` (integer 0–2). Unknown keys are stripped. Ratings outside 1–3 are ignored by the taste model instead of trusted. |
| **F6** connection abuse | Sessions exist only on ACCEPTED connections, so a pending or declined requester can't push sessions or a Join banner at anyone. One open session per pair (starting another cancels it), the 24 h cap, and unfriending cascades everything away. If F6's block or `DECLINED` status lands first, `requireConnection` still only accepts ACCEPTED. |
| **F7** email oracle | No new route takes an email or returns one. Partner objects are `{ id, name }`. Unknown-user and not-connected both return 404. |

Other rules:
- **Untrusted input:** query strings, bodies and path ids. The partner's identity is always derived from the connection row; the session's two participants are `connection.requesterId` and `connection.addresseeId`, never a body field.
- **Read access:** a session, its candidates and the vote counts are readable only by those two users. Individual votes are readable only by the person who cast them.
- **Write access:** only the two participants can vote, advance a round, pick or cancel. Only they can start a session for their connection.
- **No secrets** in logs. Reuse the mood picker's `warnFailed` api_key redaction.
- **Reviewer:** run `/security-review` on the API PRs (tasks 3 and 9). They touch API routes and Prisma.

## 7. UX notes (Cinema dark)

- **Tonight for you both** sits at the top of `/watch-together/[userId]`, above the existing shelves. It uses a mood-chip row (the extracted `MoodControls`), 5 **PosterCards** in the standard grid (3 columns on mobile), a one-line "why" caption under each card, and a **Shuffle** button. The existing shelves stay below, extended to TV.
- **Decide together** is the page's one primary button. The start step is a **bottom sheet** (Dialog primitive if F5 has merged, otherwise the `ResultFilters` sheet pattern).
- The **vote** screen is `/decide/[sessionId]`: full-height card, poster at `card` radius, 44 px buttons, swipe on touch, focus ring on buttons.
- The **reveal** uses the detail-hero treatment (#78) if it has merged, otherwise a large PosterCard. Keep motion subtle and respect `prefers-reduced-motion`.
- Loading, empty and error states use the states kit (#79): `Skeleton`, `EmptyState`, `ErrorState`.
- **Copy** names the partner ("Sam") and never shows an email.

## 8. Verification needs two signed-in users

Auth is Google-only. Verifying the decide flow on a preview URL needs **two test accounts signed in at once**. That depends on **#69 (development-only login)**. Until #69 lands, the verifier can check single-user states (start, vote, wait, expired), and the owner checks the two-person reveal by hand with a second Google account on the preview.

## 9. Measuring quality

### 9.1 Offline eval: "would both like this?"

Reuse the mood-picker approach (`docs/evals/mood-picker.md`, `scripts/mood-eval.ts`):

- `scripts/pair-eval.ts`, `npm run eval:pairs`. It calls TMDB only and **never the database**. It uses **synthetic personas** written as fixture files of TMDB ids with ratings (`scripts/fixtures/pair-personas.ts`), never real users' data.
- **Pairs** (each run with several moods: any, Light, Intense + Under 2 hrs, ~30 min):
  1. Similar tastes (both love crime dramas)
  2. Complementary tastes (rom-com lover + sci-fi lover)
  3. Opposites (horror fan + family-film parent)
  4. One cold start (rich history + 2 ratings)
  5. Both cold start
  6. Movie person + TV person (all loves are films for one, all series for the other), which checks that the catalogue really is shared
- **Output:** a markdown table per pair and mood: the top 10 with genres, the source, and two blank columns, **A likes?** and **B likes?**. A person (or Claude on a first pass, flagged for a human second opinion, as with the mood eval) rates each title ✓ / ~ / ✗ *as that persona*.
- **Metrics:**
  - **Joint hit rate** = share of titles where both are ✓ (~ counts ½). The headline number.
  - **Misery rate** = share of titles where either person is ✗. Should be low; this is what least misery is for.
  - **Movie/TV split** per pair and mood, reported as an outcome and never a target. Check that pair 6 gets both types, and that "~30 min" leans to TV because of runtimes.
- **Automated proxy (Vitest, no network):** a leave-one-out test on fixture profiles with fake candidates. Hide one title both personas Love; it should rank in the top 10 of a fixed fake pool ahead of a title only one loves. Ordering properties are pinned in `lib/pairTaste.test.ts`: least misery beats average; a cold-start partner doesn't drag scores down; a movie Love lifts a matching TV title.
- Re-run after any weight change and record the results in `docs/evals/watch-together.md`.

### 9.2 In-product signals (owner-run, later)

`decide_sessions` already records what's needed, with no extra tracking: the **match rate in round 1**, the **rounds per decision**, **time to decision** (`resolvedAt − createdAt`), how often **"Just pick for us"** is used, and how often sessions are **abandoned**. These live in production, so only the owner queries them. Agents don't.

## 10. ADRs

**ADR-1: Pair blending is least-misery-weighted (`0.7·min + 0.3·mean`).**
Options: average, least misery, veto, weighted. Average lets one person's enthusiasm override the other's dislike; strict least misery can't rank between "both fine" titles; vetoes are brittle with little data. The weighted blend is fair first, enthusiasm second, and the eval tunes it.

**ADR-2: The decision is a two-phone session with private votes on a fixed shortlist of 10.**
Options: app-only picks, two phones, pass-the-phone, endless swipe. Two phones keep votes authenticated and private (less social pressure) and fit one account per device. A fixed 10 bounds the time. App-only picks ship first as slice 1 because they need no schema. Pass-the-phone waits on Q1.

**ADR-3: Sync by polling every 3 s, not WebSockets or SSE.**
Only the wait and reveal screens poll, with cheap database reads and no TMDB calls. Vercel Functions now support WebSockets, but a socket adds connection handling and state for a few seconds of waiting. Revisit if polling load shows up in metrics or for groups.

**ADR-4: The shortlist is frozen as `DecideCandidate` rows (30 at creation: 3 rounds of 10).**
Options: recompute per request (the phones could disagree as TMDB or watchlists change), a JSON column (no foreign key from votes, so votes for made-up titles need extra checks), rows (chosen). Rows give vote integrity through the foreign key and `@@unique`, mean polling needs no TMDB calls, and make later rounds and "pick for us" free.

**ADR-5: No new dependencies or services.**
zod is already installed. Taste is deterministic code over cached genres, not an LLM: it is testable, free and explainable ("Because you both loved…"). Expiry is lazy, not a scheduled job.

## 11. Later

- Pass-the-phone mode (if Q1 says so)
- Each person picks a mood, and the app combines them (time = the shorter; vibes ranked by overlap)
- Email or push "Sam started a vote" via Resend
- Feed decide votes back into taste (a No as a soft not-interested), only with clear consent
- A quick "rate 10 you've seen" flow for cold-start partners
- Groups of 3+ (a family): least misery generalises; the session needs a participants table
- Region support beyond US
- TMDB keywords to fix the Heavy/Intense precision issues from the mood eval

## 12. Owner decisions (2026-11-26)

The owner accepted all four recommendations:

1. **Two phones** for v1: each vote is authenticated and private. Pass-the-phone is "later".
2. **"On our services" = either of you has it** (union), with an "Only services we both have" toggle.
3. **An accepted connection is consent** to use each other's ratings for pair picks and reasons, plus one disclosure line in the Friends UI. No per-friend opt-in.
4. **The starter sets the mood** for a decide session.

## 13. Task breakdown

Thin vertical slice first: **tasks 1–5 ship "Tonight for you both"** (no schema, usable on its own). Tasks 7–11 add the decide session. Tasks 1, 2, 4, 7 and 8 can start in parallel.

| # | Task | After | Files / areas | Model |
|---|---|---|---|---|
| 1 | Shared traits + pair taste model | — | `lib/traits.ts`, `lib/pairTaste.ts`, `*.test.ts` | Opus |
| 2 | `requireConnection` helper; use it in the existing route | — | `lib/connections.ts` (+ test), `app/api/watch-together/[userId]/route.ts` | Sonnet |
| 3 | Pair pool + `GET …/picks` route | 1, 2 | `lib/pairPool.ts` (+ test), `app/api/watch-together/[userId]/picks/route.ts` | Opus |
| 4 | Extract `MoodControls` from What to Watch | — | `components/mood/MoodControls.tsx`, `app/(main)/what-to-watch/page.tsx` | Sonnet |
| 5 | "Tonight for you both" UI + TV in the existing shelves | 3, 4 | `app/(main)/watch-together/[userId]/page.tsx`, `app/api/watch-together/[userId]/route.ts` | Opus |
| 6 | Pair eval script + first results | 3 | `scripts/pair-eval.ts`, `scripts/fixtures/pair-personas.ts`, `docs/evals/watch-together.md`, `package.json` (script) | Sonnet |
| 7 | Decide schema | — | `prisma/schema.prisma` | Sonnet |
| 8 | Decide logic (pure) + zod schemas | — | `lib/decide.ts` (+ test) | Opus |
| 9 | Decide API routes | 2, 3, 7, 8; owner `db push` to production | `app/api/decide/**` | Opus |
| 10 | Decide UI: vote, wait, reveal, no match | 9, 4 | `app/(main)/decide/[sessionId]/page.tsx`, `components/decide/*` | Opus |
| 11 | Entry points + consent copy | 9, 5 | `app/(main)/watch-together/[userId]/page.tsx`, `app/(main)/profile/page.tsx` | Sonnet |

Conflicts to avoid: tasks 2 and 5 both touch the existing watch-together route (run 5 after 2). Tasks 5 and 11 both touch the watch-together page (11 after 5). Task 11 touches the profile page, so check for any open F6/F7 or redesign PR on `profile/page.tsx` first.

### Task 1: Shared traits + pair taste model
Pure functions, no network or database.
- `lib/traits.ts`: movie and TV genre ids → shared trait strings.
- `lib/pairTaste.ts`: `buildTasteProfile(entries)`, `affinity(profile, candidate)` with confidence shrinkage, `pairFit(a, b)`, `pairScore(...)` per §5.1. Ratings outside 1–3 are ignored.

**Done when:** `npm test` passes with tests for:
- the trait mapping (TV Sci-Fi & Fantasy ↔ movie Sci-Fi)
- a movie Love lifting a TV title with the same traits
- an empty profile giving 0.5
- `pairFit` ranking (0.7, 0.7) above (0.95, 0.3)
- a cold-start partner not lowering the other's ranking
- rating 999 being ignored

### Task 2: `requireConnection` helper
- `lib/connections.ts`: `requireConnection(myId, otherId)` → the ACCEPTED connection or `null`. Tested with `vi.mock("@/lib/db")`.
- Switch `app/api/watch-together/[userId]/route.ts` to use it, returning 404 instead of 403.

**Done when:** tests cover accepted, pending, either direction and self. On the preview, `/api/watch-together/<unconnected id>` returns 404 and a connected friend still loads.

### Task 3: Pair pool + `GET /api/watch-together/[userId]/picks`
- `lib/pairPool.ts` (pure, with injected fetchers): merge sources A–D, apply the excludes, apply the mood filter via `matchesDiscoverParams` / `filterByRealRuntime`, resolve services (union / intersection / one-sided), score with task 1, and write the privacy-safe reason strings.
- The route wires in TMDB through `createLimiter(6)`, within the caps in §5.2, plus zod query parsing.

**Done when:**
- Unit tests cover: excludes from either person; union vs intersection; one person with no services; no type quota (a fake pool of all-TV matches returns all TV); reasons never mention a dislike.
- On the preview, two connected test accounts get a 200 with movies and TV.
- An unconnected id returns 404, and no session returns 401.

### Task 4: Extract `MoodControls`
Move the mood chips and toggles from `what-to-watch/page.tsx` into `components/mood/MoodControls.tsx`, with props `value` and `onChange`, plus flags to hide the media control and show the "both have" toggle. No behaviour change.

**Done when:** What to Watch looks and works the same on the preview (the verifier compares it with production), and lint, type-check and tests pass.

### Task 5: "Tonight for you both" UI
- On `/watch-together/[userId]`: `MoodControls` (no media control), 12 picks drawn from the pool with a weighted shuffle, a reason caption on each, Shuffle (a new 12 without repeats while the pool lasts), the loading, empty, error and rate-10 note states from §5.3, and PosterCard if it has merged.
- Extend the existing route's shelves to include TV, and drop `email` from its `friend` response.

**Done when:** on the preview, signed in with a connected test account:
- 12 picks show, with movies and TV both possible.
- Changing the mood refetches.
- With services on and nothing matching, the empty state shows.
- A cold-start partner shows the banner.
- Mobile shows a 3-column grid.

### Task 6: Pair eval
`scripts/pair-eval.ts` plus the persona fixtures (§9.1), `npm run eval:pairs`, and the first results written up in `docs/evals/watch-together.md`: joint hit rate, misery rate and the movie/TV split per pair.

**Done when:** the script runs with only `TMDB_API_KEY` from `.env.local` (no database), prints the tables, and the doc has a first-pass rating, flagged for a human second opinion.

### Task 7: Decide schema
Apply the §5.4 diff and run `prisma db push` against `dev-clean` (confirm the `ep-royal-tooth-…` host first).

**Done when:**
- `prisma validate` passes, CI is green, and the three tables exist on `dev-clean`.
- The PR body tells the owner to run `db push` on production before task 9 merges.

### Task 8: Decide logic (pure)
`lib/decide.ts`:
- `splitIntoRounds(ranked, 10, 3)`
- `resolveRound(candidates, votesA, votesB)`, returning a match, the runners-up and `bothReallyWant`, or no match
- `pickForUs(held, votes)`
- `isRoundComplete`
- zod schemas for the bodies in §5.6

**Done when:** tests cover a single match, a tie broken by Really-want and then by score, no match, "pick for us" skipping No-voted titles, an incomplete round, and invalid vote values rejected.

### Task 9: Decide API routes
All routes in §5.6, with the authorization rules from §5.6 and §6, a Serializable transaction for vote + resolve, the 20-per-day cap and lazy expiry.

**Done when:**
- Route tests (mocked Prisma) cover: a non-participant gets 404; a vote on another session's candidate gets 409 or 404; voting after resolve gets 409; the 21st session in 24 h gets 429; partner votes never appear in the `GET` response.
- On the preview, `curl` with a test session shows the happy path.
- `/security-review` is clean.

### Task 10: Decide UI
`/decide/[sessionId]`: vote cards (buttons, swipe, keys, undo), wait (3 s poll), reveal, no match (Try 10 more / Just pick for us), and the expired, cancelled and 404 states.

**Done when:** on the preview, a single test account can start, vote on all 10 and see the wait screen, and an expired session shows "This vote has ended". The two-person reveal is checked by the owner, or by the verifier once #69 has merged (§8).

### Task 11: Entry points + consent copy
- A "Decide together" button and start sheet on the Watch Together page.
- A Join banner (from `GET /api/decide?partnerId=`) on the Watch Together page and Profile → Friends.
- The disclosure line in the Friends UI (§5.5, subject to Q3).

**Done when:** on the preview, starting from the button lands on `/decide/<id>`; the other account sees "Join"; the disclosure line is visible where requests are sent and accepted.
