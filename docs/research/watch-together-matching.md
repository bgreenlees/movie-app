# Watch together: better matching (style, story, quality, not just genre)

Research spike for #193 (tracking #93). Researcher, 2026-11-27. Docs only, no app code changed.

## Summary

- **All five bad picks reproduce** on a synthetic pair modelled on the owner's feedback. They come from
  two places: **TMDB recommendations taken at face value** (If I Stay and Creed III are The Social
  Network's #16 and #12 recommendations), and a **discover fill that knows nothing about taste**
  (MobLand, The Shadow's Edge and Minions & Monsters are in the top 50 of plain "popular, ★6.5+").
- **The taste model can't tell them apart.** It scores genres only, and every pure drama gets
  *exactly* the same affinity. Worse, it **averages** traits, so a "drama" Love cancels a "crime"
  dislike: MobLand stays at a 12% chance per draw even when the partner has rated violent crime
  "didn't like".
- **Recommendation: build six small fixes in two phases.** Phase 1 needs no schema change:
  informative traits, the missing negatives (kids' animation, foreign language), a check that a
  recommendation shares a theme with its seed, taste-led discover pages, a shorter draw window, and
  a "Why this?" line. Phase 2 adds cached TMDB keywords to the taste profile.
- **Measured on the fixtures**, all layers together take the expected number of bad picks in a
  12-card draw from **0.60 to 0.00**, and the chance of drawing Trumbo or Beautiful Boy from
  **0.30 to 0.45** (0.77 in the variant where the partner has rated violent crime "didn't like").
  TMDB calls stay within the issue's budget: recommendations stay at ≤ 8, and discover calls don't
  increase.
- **`/similar` is not the answer.** It returns near-identical generic lists for unrelated seeds
  (see F7).
- **Building on Discover's recommender** (owner steer, 2026-11-28) also removes all five bad picks
  on the fixtures, with no keyword calls. But its top 12 is generic: `/similar` classics (The
  Poseidon Adventure, Dances with Wolves) and random hidden gems. Its "consensus" turns out to be
  partly fake for pairs: a seed both people loved counts as agreement, and `/similar` lists agree
  because they're all the same. **Recommendation: a hybrid.** Take Discover's per-person,
  more-seeds consensus (distinct seeds only), and keep F1, F3, F5 and F6 from this doc. See
  [Comparison](#comparison-building-on-discovers-recommender).

## Method

**Fixtures (observed, no production data).** Bob and Laura's real lists are in the production
database, which agents may not touch, so I built a **synthetic pair** from real TMDB titles that
fits the feedback:

| Person | Loves (3) | Likes (2) | Didn't like (1) | Want |
|---|---|---|---|---|
| A ("Bob-like") | The Social Network, Moneyball, Spotlight, Succession | The Crown, The Big Short | Fast X | The Holdovers |
| B ("Laura-like") | The Social Network, Little Women (2019), Marriage Story, Normal People | Ted Lasso, Lady Bird | *variant "dislikes" only:* Peaky Blinders, John Wick | Past Lives |

**Labelled test set** (the owner's feedback):

| Label | Title | TMDB |
|---|---|---|
| good | Trumbo | movie 294016 |
| good | Beautiful Boy | movie 451915 |
| bad | If I Stay | movie 249164 |
| bad | Creed III | movie 677179 |
| bad | MobLand | tv 247718 |
| bad | Minions & Monsters | movie 1315772 |
| bad | The Shadow's Edge | movie 1419406 |

**Harness.** A scratch script (not committed) ran the real `buildPairPool` (`lib/pairPool.ts`) with
the same TMDB fetchers as `scripts/pair-eval.ts`, mood "any", today 2026-11-28. Then I re-scored the
pool with each proposed fix switched on in turn, and simulated 2,000 draws with the real
`drawPairPicks` (`lib/pairPicks.ts`). Trumbo and Beautiful Boy weren't produced by these synthetic
lists, so I injected them as plain discover candidates with no source boost. That's the worst case
for them. TMDB data was fetched 2026-11-27, and recommendation lists drift over time.

**Metric.** "Expected bad picks per draw" is the sum of the five bad titles' chances of being in a
12-card draw. "Good" is the same sum for the two good titles.

## Why each bad pick appears (observed, baseline)

Baseline pool: 100 titles. P = chance of being in a 12-card draw.

| Title | Source and reason line | Rank | P | What scored it |
|---|---|---|---|---|
| If I Stay | Rec of The Social Network (joint seed): "Because you both loved The Social Network" | 2 | 24% | Genres = Drama only → affinity 0.79 / 0.76, identical to Good Will Hunting. Joint seed → source boost 0.6. No keyword in common with its seed except the generic "based on novel or book". |
| Creed III | Same seed, rec #12 | 25 | 13% | Drama + Action. Action is −0.33 for A (Fast X), but it's averaged with Drama +0.62. |
| MobLand | Discover TV, page 1 (popularity 1,221, ★8.7 / 1,323) | 41 | 15% | traitScore 0.72 (quality is near the maximum). Crime + Drama average out to about neutral. In the dislikes variant it's still rank 46, 12%. |
| The Shadow's Edge | Discover movie #38 (Mandarin, ★8.4 / 1,639) | 68 | 5% | traitScore 0.67. Nobody has rated a non-English title, but language isn't a signal. |
| Minions & Monsters | Discover movie #48 (family animation, ★7.5 / 1,425) | 80 | 3% | Comedy is positive for both people. Animation and Family are unseen, so they count as 0 (neutral), not negative. **Not a bug:** it's the missing negative signal the issue suspected. |

Code paths: recommendations `lib/pairPool.ts:492-566` (no vote floor and no relevance check, ranked
by seed count and position only). Discover `lib/pairPool.ts:495-508` with `moodToDiscoverParams`
(`lib/moodPicker.ts:96-137`: `popularity.desc`, ★6.5, 300 / 150 votes, no taste input). Affinity
`lib/pairTaste.ts:105-115` (mean over genre traits). Score `lib/pairTaste.ts:150-152`. Draw
`lib/pairPicks.ts` `drawWeight` (0.05 + rank², over the whole 100-title pool).

## Findings, ranked by impact

### F1. Recommendations are kept with no check that they resemble their seed (impact: high, effort: M)
**What.** Every title in a seed's `/recommendations` list is kept, and a joint seed gives it a 0.6
boost. TMDB's list for The Social Network (observed 2026-11-27) is The Social Reckoning, Good Will
Hunting, Jobs, Speak, Antitrust, My Salinger Year, Gigi & Nate, The Paper Chase, Richard Jewell,
Call Me Crazy, …, Creed III (#12), The Giver, …, If I Stay (#16). That's co-viewing noise, not
similarity. By contrast, Trumbo's recommendations (Mank, Chaplin, Hitchcock, The Fabelmans) and
Beautiful Boy's (A Million Little Pieces, Requiem for a Dream, Honey Boy, Ben Is Back) are on-theme.
So the noise varies by seed and needs a per-title check, not a blanket rule.
**Why it matters.** It produces two of the five bad picks, and the reason line makes them look
deliberate ("Because you both loved …"), which is what annoyed the owner.
**Fix.** Keep a recommendation only if it shares at least one **theme** (keyword-derived, see F4)
with its seed. Otherwise drop it, or at least zero its source boost and strip the "Because …" line.
Measured: If I Stay and Creed III are removed (0%) and 11 of the 100 pool titles drop. **Known false
negative:** Good Will Hunting is dropped too (it shares only "boston" with The Social Network, and
place keywords are stoplisted).
**Cheap extras, no new calls:** a vote floor on recommendations (≥ 200 for movies, ≥ 100 for TV). Six of
The Social Network's 20 recommendations have fewer than 160 votes (Call Me Crazy 45, The Sound of
Silence 43, Let Him Have It 51…). This doesn't remove If I Stay (4,385) or Creed III (3,054).
**Cost.** One keywords lookup per seed (≤ 8, cached) plus one per candidate checked (see Budget).

### F2. Averaging genre traits hides dislikes, and Drama is uninformative (impact: high, effort: S)
**What.** `affinity` takes the mean of trait weights. Drama is on nearly everything, so (a) every
pure drama scores the same, and (b) a strong negative is diluted: Crime −0.33 plus Drama +0.46 gives
a slightly positive affinity for MobLand from someone who "didn't like" Peaky Blinders.
**Fix.** (1) Down-weight very common traits (Drama weight 0.2, or an IDF-style weight per trait).
(2) **Cap affinity by the worst clear dislike**: if any trait on the title is below −0.2 for a person,
their affinity can't exceed what that trait alone gives. This uses dislikes only server-side, so
§5.5 is unaffected.
**Measured.** On its own this is small: expected bad picks 0.60 → 0.45, because most of the
problem is the sources. It's the base the other fixes need, though: with it, Creed III's affinity
for A falls from 0.59 to 0.32.

### F3. Missing negatives: kids' animation and foreign language (impact: medium, effort: S)
**What.** A genre or language nobody has rated counts as neutral, so popular family animation and
foreign-language action get through on quality alone.
**Fix.** Per person: if a title is Animation or Family and that person has no positive signal for
it, cap their affinity at 0.3. If its `original_language` isn't one they've rated positively, cap it
at 0.35. Least-misery then pushes the title down. For discover, filter at the source as well: add
`without_genres=16,10751` and `with_original_language=<pair's languages>` unless someone has rated
those positively. That's free: `original_language` and `genre_ids` come in the list results already.
**Measured.** Minions & Monsters 3% → 2% and Shadow's Edge 5% → 4% from scoring alone. Filtering
at the source removes both from discover entirely (0%).

### F4. Taste needs traits richer than genre: themes, tone, people (impact: high, effort: M–L)
**What.** TMDB keywords carry the "style and story" the owner is asking for. The Social Network has
*biography, based on true story, docudrama, legal drama, social media*. Trumbo has *biography,
blacklist, screenwriter*. Beautiful Boy has *based on true story, drug addiction, father son
relationship*. If I Stay has *coma, teen drama, based on young adult novel*. MobLand has *gangster,
brutal violence*. TMDB also tags tone ("intense", "witty", "serious", "hilarious"), which is exactly
the style signal. Director or writer (Sorkin wrote The Social Network and Moneyball) is another
strong, cheap trait.
**Fix.** Add keyword traits to the shared trait vocabulary (`lib/traits.ts`) and to the profile in
`lib/pairTaste.ts`, plus a **theme term** in `pairScore` (in the prototype: `0.4·fit + 0.25·quality
+ 0.15·source + 0.2·theme`, where theme = how many non-genre traits *both* people match, capped at 2).
**Use a curated theme map, not raw keywords** (suspected from the prototype's noise). Raw overlap
produced "Feed" via *twins* and "Virgin River" via *california*. A map of about 25 themes (true
story, addiction, family drama, teen/YA, sports, gangster/violence, kids' animation, period, legal,
journalism…) plus TMDB's tone keywords, keyed by keyword id, is explainable and stable. Stoplist the
generic ones (*based on novel or book, sequel, duringcreditsstinger*, places).
**Measured** (with F2 + F3): expected bad 0.45 → 0.39, good 0.39 → 0.48. Trumbo and Beautiful Boy
rise from rank 32 / 26 to 21 / 15, matched on "true story".
**Data.** Phase 1 can use keywords for seeds and candidates only (fetched, cached). A full profile
over everyone's history needs keywords cached on `Movie` / `TVShow` (a new `keywords Json?` column,
filled by adding `append_to_response=keywords` to the details fetch that already caches the row, plus
a one-off backfill). That's a schema change (`prisma db push`), so it's the owner's call: Phase 2.

### F5. Discover fill is taste-blind (impact: high, effort: M)
**What.** Source D is the four most popular pages per type at ★6.5+. Observed page 1 for movies:
Iron Man, The Odyssey, The Hunger Games…, Resident Evil, Home Alone, Toy Story 5. For TV: Black
Mirror, New Girl, The Wire, Slow Horses, MobLand… It's 80 of the 100 pool slots for a pair with
short lists.
**Fix.** Swap 2 of the 4 discover pages per type for **taste-led** queries built from the pair's
shared positive themes: `with_keywords=<shared theme keyword ids joined with |>`, the genres they
share, the F3 filters, ★6.5 and 300 votes. Keep 2 popularity pages for variety. Cap discover at
about 40 pool slots. The number of discover calls is unchanged (8).
**Observed.** For this pair (shared theme "true story": keywords 5565 | 9672, Drama, English, no
kids' genres), page 1 is Titanic, Oppenheimer, The Wolf of Wall Street, Schindler's List, The
Imitation Game, The Social Network, Green Book, Catch Me If You Can, A Beautiful Mind… That's
"Trumbo-type" picks. Trumbo itself isn't on the first 4 pages; Beautiful Boy is #68 when sorted by
rating with ≥ 1,000 votes.
**Measured** (on top of F1–F4): expected bad 0.15 → 0.07 (MobLand falls from rank 54 to 72).

### F6. The draw reaches the bottom of a 100-title pool (impact: medium, effort: S)
**What.** `drawWeight = 0.05 + rank²` over all 100 titles, so rank 80 still lands in about 3% of
draws. Every residual bad pick in the measurements comes from this tail.
**Fix.** Draw from the top 36 (3 × 12). Shuffle still gets 3 screens of variety, and the rest of the
pool stays for Decide's later rounds. Alternatively drop the floor to 0.01 and use rank³.
**Measured** (on top of F1–F5): expected bad 0.07 → **0.00**, good 0.41 → 0.45 (0.77 in the
dislikes variant).

### F7. TMDB `/similar` is worse than `/recommendations` (impact: informs the choice, effort: none)
**Observed 2026-11-27.** `/movie/37799/similar` (The Social Network) and `/movie/451915/similar`
(Beautiful Boy) return nearly the **same** list: Apollo 13, The Experiment, To Die For, Dances with
Wolves, The Hours, Fight Club, The Poseidon Adventure, M*A*S*H, Ben-Hur, GoodFellas, Gone with the
Wind… Trumbo's `/similar` overlaps heavily too. It's not seed-specific, so don't add it as a source.

### F8. Want-list titles are scored as mediocre (impact: low, effort: S)
**Observed.** `entryCandidate` (`lib/pairPool.ts:286-298`) sets `voteAverage: 0` and has no
`voteCount`, so unless a details lookup ran (only with a time or services filter) `traitScore`
falls back to the 6.8 prior: quality 0.32. The Holdovers scored traitScore 0.41, below Feed (0.42).
Wants still rank well through their source boost, but the quality term is wrong. Fix: cache
`vote_average` / `vote_count` with the title row, or reuse discover / recommendation data when the
same title appears there.

## Combined results on the fixtures

Cumulative: each row adds one fix to the row above. Expected number of the 5 bad / 2 good titles in
a 12-card draw.

| Fixes on | Base: bad | Base: good | Dislikes variant: bad | Dislikes variant: good | Pool |
|---|---|---|---|---|---|
| none (today) | 0.60 | 0.30 | 0.55 | 0.35 | 100 |
| + F3 negatives | 0.47 | 0.35 | 0.46 | 0.35 | 100 |
| + F2 informative traits | 0.45 | 0.39 | 0.45 | 0.38 | 100 |
| + F4 themes | 0.39 | 0.48 | 0.36 | 0.51 | 100 |
| + F1 seed relevance | 0.15 | 0.50 | 0.11 | 0.52 | 89 |
| + F5 taste-led discover | 0.07 | 0.41 | 0.06 | 0.48 | 107 |
| + F6 draw top 36 | **0.00** | **0.45** | **0.00** | **0.77** | 107 |

(The pool column excludes the 2 injected probes.) Top 12 after all fixes (base): Michael, Green
Book, Schindler's List, A Beautiful Mind (taste-led discover) · The Case for Christ, Gigi & Nate,
Flash of Genius, Richard Jewell (recommendations, "true story") · The Holdovers, Past Lives (wants) ·
Shameless, Feed, Virgin River. Feed and Virgin River are keyword-noise survivors that the curated
theme map (F4) should fix.

**Caveats.**
- The personas are synthetic. The real accounts may differ, so Step 2 should re-check with the owner
  using the "Why this?" line.
- Weights weren't tuned beyond one pass.
- Not yet re-run against the six existing pairs in `docs/evals/watch-together.md`. The kids' and
  language caps in particular need checking on the "opposites" (horror + family) pair.
- F5 used hand-picked keyword ids for this pair. The worker has to derive them from the pair's
  shared themes.

## Comparison: building on Discover's recommender

The owner says the Discover pages' recommendations "work very well", so I ran Discover's algorithm
for **each person** and combined the results. The algorithm is in
`app/api/movies/recommended/route.ts` and `app/api/tv/recommended/route.ts`, which are the same
apart from types:
- up to 15 seeds (rated ≥ 2, Loves first)
- `/recommendations` weighted ×3 for a Love and ×1 for a Like
- `/similar` for the first 10 seeds, at ×0.7 (×2 or ×1 by rating)
- one hidden-gems discover page in the top 3 genres, +1.5
- +2 for ★ ≥ 7 with 150–3,000 votes
- −0.5 per disliked genre

Same fixtures and draw simulation as above. Discover does page 1 per seed for each person, then the
pair score is:
- **strict:** `0.7·min + 0.3·mean` of each person's normalised Discover score, +0.2 when both
  people's lists contain the title
- **hybrid:** each person's Discover score where they have one, otherwise their `pairTaste`
  affinity, then the existing pair formula

| Variant | Base: bad | Dislikes: bad | Top 12 (base), observed |
|---|---|---|---|
| Today's pair pool | 0.60 | 0.55 | Good Will Hunting, If I Stay, Gigi & Nate, Speak… (The Social Network recs) |
| Discover per person, strict | 0.14 | 0.15 | Richard Jewell, The Hours, Speak, Gigi & Nate, What Maisie Knew, The Experiment, GoodFellas, Manhattan, The Bridges of Madison County, The Poseidon Adventure… |
| Discover, hybrid | 0.17 | 0.16 | Richard Jewell, GoodFellas, Off Campus, then hidden gems: Teach You a Lesson, The Chosen, Frieren, When Life Gives You Tangerines… |
| Discover strict + top-36 draw (F6) | **0.00** | **0.00** | as strict |
| + agreement only from *different* seeds, gems without Drama, English, no kids' genres | 0.00 | 0.00 | Richard Jewell, The Hours, The Experiment, Club de Cuervos, Manhattan, GoodFellas, Brassic… |
| + no `/similar` | **0.47** | **0.47** | Speak, Gigi & Nate, What Maisie Knew, Good Will Hunting, Jobs… (If I Stay back to 29%) |
| + no `/similar`, no gems | **0.63** | **0.63** | The Social Network recs fill the grid again |

MobLand, Minions & Monsters and The Shadow's Edge were never reached in any Discover variant, since
popular discover isn't a source. Trumbo and Beautiful Boy weren't reached either: neither approach
produces them from these synthetic lists. The F1–F6 stack above did surface "Trumbo-type" picks
through taste-led discover.

**What this shows (observed on the fixtures):**
1. **Removing the popular fill is most of the win** for MobLand, Minions and Shadow's Edge. Both
   approaches agree on this.
2. **Discover's resistance to If I Stay is crowding, not consensus.** With `/similar` and gems on,
   If I Stay sinks to rank 50–77. Take them away and it's back at 29–38%. A pair that both loved
   The Social Network "agrees" on every one of its recommendations, so per-person consensus doesn't
   filter a **shared** seed's noise. Counting agreement only from different seeds helps
   (bad 0.14 → 0.06 before the draw cut), but doesn't fix it.
3. **`/similar` consensus is spurious.** Its lists are near-identical across seeds (F7), so titles
   like The Poseidon Adventure and Dances with Wolves "agree" across Spotlight, The Social Network
   and The Big Short. They rank high for *every* pair, which is the "random" complaint in a
   different form.
4. **Hidden gems are noisy for a pair.** With Drama among the top genres, the gem query returns
   foreign-language and obscure titles (Teach You a Lesson, Harakiri, Divaldo Franco). Without
   Drama it returns classic comedies (City Lights, The Kid). The owner's single-person Discover
   probably works better because real accounts have 15+ ratings and more specific top genres (not
   verified: production data is off-limits).
5. **Suspected, not measured:** with 15 seeds per person (a real account), consensus is stronger
   than in these fixtures (3–4 seeds per type per person). The fixtures understate Discover.

**Recommended hybrid** for the worker:
- **Candidates.** Each person's Discover-style recommendation track, with consensus over
  **distinct** seeds, and a seed both loved counted once. Add taste-led discover pages (F5) in
  place of both popular discover and hidden gems. Drop `/similar`, or keep it at a low weight
  with no agreement credit.
- **Filters.** F1 seed relevance (still needed for shared seeds), F3 kids/language, and a vote
  floor on recommendations.
- **Score.** F2 informative traits, least misery, and an agreement bonus only across different
  seeds.
- **Draw.** F6, the top 36.
- **"Why this?"** Unchanged (below).

**TMDB budget for the Discover approach.** Discover per person is up to 15 recommendation + 10
similar + 1 discover calls per media type. For a pair across both types that's up to 104 calls on a
cold request, which breaks the issue's "≤ 8 recommendation calls". The pair route can share cached
results with each person's own Discover page. Next.js caches `fetch` by URL and options, and the
recommendation and similar calls use `revalidate: 86400`
([Next.js: fetch, `next.revalidate`](https://nextjs.org/docs/app/api-reference/functions/fetch)).
That only helps when each person loaded Discover with the same seeds and page within the day.
Suggested cap: **6 seeds per person (12 recommendation calls), no `/similar`**, cached. That's a
budget increase the owner needs to approve (decision 4). Seeds the two people share are fetched
once.

## "Why this?" line

Shown under each pick's reason, for example:
- "Because you both loved The Social Network · **Why this?** True story, legal drama"
- "Highly rated · **Why this?** True story, like The Social Network and Spotlight"
- "On Laura's list" (no "Why this?" needed)

**Privacy (§5.5).** Build it only from things the partner may already see: the source, **Loves and
Likes** (named titles), and the **candidate's own** themes that match those titles. Never use
dislikes, not-interested, profile weights or affinity, and never state a negative ("not violent").
A theme shown is one the candidate shares with a *named* Love, so it reveals nothing beyond the
existing "Because Sam loved X". Use one source-level phrasing for both people (`partnerReason` gets
the mirrored wording, as today).

**Display.** Top 2 shared themes, Drama never shown. Fall back to the source line alone when no theme
matches. This doubles as a feedback tool: the owner can say "true story is right, but not teen".

## TMDB budget

Per request today: recommendations ≤ 8 (`REC_CALLS_MAX`), discover 8, details ≤ 30 (`FACTS_BUDGET`)
plus final runtime checks, all cached (recommendations 24 h, `lib/tmdb.ts:290-296`).

Proposed:
- Recommendations: unchanged, ≤ 8.
- Discover: unchanged at 8 (2 popularity + 2 taste-led pages per type).
- **New: keywords** for each seed (≤ 8) and for the top 30 candidates after a first-pass score
  (`/movie/{id}/keywords`, cached 7 days because keywords rarely change). That's at most 38 new calls
  on a cold request, mostly cache hits after that: the same seeds give the same recommendations.
- Phase 2 (keywords column): history keywords come from the database, so no calls.

TMDB disabled its old 40-requests-per-10-seconds limit in December 2019. Their docs say a soft bound
of about 40 requests per second remains, may change, and clients should handle 429s
([TMDB: Rate limiting](https://developer.themoviedb.org/docs/rate-limiting), read 2026-11-27).
`append_to_response` takes up to 20 sub-requests
([TMDB: Errors, code 27](https://developer.themoviedb.org/docs/errors)). The existing limiter in
`lib/concurrency.ts` keeps bursts well below that.

## Known limits

- **The language cap is English-first.** `likedLanguages` is always empty: cached `Movie`/`TVShow` rows have no `originalLanguage`, so a person's positive ratings never record a language. Every non-English candidate is capped (0.35) regardless of what they've enjoyed; English and unknown languages are never capped. Fixing it needs a schema column, which is out of scope here and planned in the engine spec (#199).
- **The dislike cap needs two signals.** A trait only caps a title's affinity once it has weight below -0.2 *and* at least two disliked titles carry it, so a single weak signal doesn't veto a title.

## Decisions for the owner

1. **Drop off-seed recommendations, or just demote them?** Recommendation: **drop** them. Demoting
   still let If I Stay into 15% of draws. The cost is losing some good-but-unrelated ones (Good Will
   Hunting).
2. **Keywords column (schema change) for Phase 2?** Recommendation: **yes, after Phase 1 ships** and
   the owner has used "Why this?" for a few nights.
3. **Kids' animation off by default** unless someone rated it? Recommendation: **yes**. It's the
   most obvious "random" category.
4. **Recommendation-call budget for the Discover-style hybrid.** Raise it from 8 to 12 (6 seeds per
   person, no `/similar`)? Recommendation: **yes**. All calls are cached for 24 h and shared with
   Discover where the URLs match. Stay at 8 if TMDB 429s show up in the logs.
