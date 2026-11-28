# Recommendation design study

Research for #206 (tracking #93). Researcher, 2026-11-28. Docs only: no app code, no schema change.
This is Phase 1. Phase 2 (export script, generator, round 1 sheet) and Phase 3 (build) become
separate issues once the owner approves it.

Background: `docs/recommendations.md` and `docs/specs/recommendation-engine.md` (both in open PR
#202), `docs/research/watch-together-matching.md` (#193), `docs/evals/`. Code read at `main` 9b28aba
(after #201).

## Summary

- **The pair problem is what a pick may rest on.** Today a pair pick can stand on any of 15 reason
  lines (10 kinds), and only 3 kinds involve both people. Proposal to test: a pick stands on a **shared
  thread** (a curated theme, creator or kind of story both people rate well) or on both want lists.
  Everything else is capped fill.
- **Why Discover works for the owner** (measured, §2): its +2 bonus for ★ ≥ 7.0 at 150–2,999 votes
  acts as a **gate**. On two test personas, all 12 of the top 12 had it, and 9 of 12 were tied, so
  popularity only ordered the ties. That's the hidden-gem effect. Whether it suits a **couple** is a
  hypothesis (H4), not a requirement. Discover run per person and combined is candidate **A**,
  judged like every other approach.
- **Round 1 compares three approaches**, 12 pair picks each, on one blind, shuffled sheet:
  **A** Discover-pair (each person's Discover list, combined by least misery), **B** pure shared
  threads, and **D** a hybrid (A's candidates, kept only if they fit a shared thread, with
  thread-led reasons and at most 2 weak fills). Each person marks the picks in a private Google
  Sheet in ~10 minutes.
- **Pass marks are about the two of them**, fixed in §5 before any data exists: ≥ 2/3 of unseen
  picks good for both, **0 Bad** from either, and reasons judged right ≥ 10/12. "Nothing passes" is
  a valid result.
- **Agents never touch production.** The owner runs export, generate and score locally. Only counts
  go to GitHub.

## 1. What's wrong today (evidence)

**Observed by the owner** (#206, live, 2026-11-28): "Up next for you both" showed 14 picks resting on
7 kinds of reason. Only 4 rested on something both people like, and 3 of those were weak (If I Stay,
Scarlet Street and Elmer Gantry, all from TMDB recommendation noise). Others were "Highly rated" fill
(The Rookie) or one-person reasons ("On your list", "Because Laura loved Say Anything").

**Observed in the code.** `reasonFor` (`lib/pairPool.ts:778-810`) returns one of these, in priority
order:

| # | Reason line | Rests on | Both people? |
|---|---|---|---|
| 1 | "On both your lists" / "You're both watching this" | both want lists | yes |
| 2 | "You're watching this, and it's on Laura's list" | one watching + other's list | yes |
| 3 | "On your list" / "You're watching this" | one person's list | **no** |
| 4 | "On Laura's list" / "Laura is watching this" | one person's list | **no** |
| 5 | "Because you both loved X" | TMDB recs of a title both rated well | partly: the *seed* is shared, but the rec may not resemble it |
| 6 | "Because you loved X and Laura loved Y" | in the recs of a seed from each person | yes, by two TMDB lists overlapping |
| 7 | "Because you loved X" / "Because Laura loved X" | one person's seed | **no** |
| 8 | "Fits a light / heavy / intense night" | mood only | **no** |
| 9 | "Highly rated" | ★ ≥ 7.5, ≥ 300 votes | **no** |
| 10 | "Popular right now" | discover popularity | **no** |

**Observed on TMDB** (2026-11-28, `/search` + `/{type}/{id}/keywords`, dev key):

| Title | Genres | TMDB keywords (first 10–14) |
|---|---|---|
| Scarlet Street (1945) | Drama, Crime | new york city, roommates, pimp, death sentence, painter, femme fatale, **film noir**, murder, scam, electric chair, gloomy |
| Elmer Gantry (1960) | Drama | based on novel or book, **con man**, fraud, kansas, usa, religion, **period drama**, preacher, religious hypocrisy… |
| If I Stay (2014) | Drama | coma, based on novel or book, musician, teenage girl, car accident, **teen drama**, based on young adult novel |
| The Rookie (2018, TV) | Crime, Drama, Comedy | police chase, los angeles, california, police officer, …, **procedural**, police drama, dramedy |
| Say Anything... (1989) | Romance, Comedy, Drama | high school, seattle, washington, **teenage love**, teenage angst… |
| Trumbo (2015) | Drama | movie business, screenwriter, **biography**, hollywood, writer, communism, blacklist, mccarthyism, 1940s |
| Beautiful Boy (2018) | Drama | **drug addiction**, **biography**, **based on true story**, based on memoir, father son relationship, psychological drama |
| The Social Network (2010) | Drama | hacker, based on novel or book, boston, **biography**, **based on true story**, docudrama, social media, legal drama, conceited |

What this shows:
1. **Genre can't tell these apart; keywords can.** The two good picks share *biography / true
   story* with The Social Network, and the bad ones don't (*teen drama*, *film noir*).
2. **Raw keywords are noisy.** Places (*boston, kansas, seattle*), sources (*based on novel or
   book*) and odd specifics (*twins*, *electric chair*) make up about half of each list. A thread
   has to be a **curated group** of keywords (#193 F4 found the same in its prototype).
3. **A one-person seed pulls in only that person's taste.** Say Anything's recommendations today:
   10 Things I Hate About You, The Half of It, Drive Me Crazy, Pretty in Pink, Sierra Burgess Is a
   Loser, Zoey 102… That's right for solo Discover and wrong for a pair.

## 2. How Discover works, and why the owner likes it

Discover is the spot the owner rates highest ("constantly unearths good hidden gems"). Knowing why
helps every design. It doesn't make it the right logic for a couple: it was built for one person.

`app/api/movies/recommended/route.ts` (TV: `app/api/tv/recommended/route.ts`, same shape, bonus at
100–2,999 votes). Per person and media type:

```
seeds   = rated ≥ 2, Loves first, up to 15
score  += 3 per Love seed / 1 per Like seed whose /recommendations contain the title
score  += 0.7 × (2 Love / 1 Like) per seed (first 10) whose /similar contains it
score  += 1.5 if in the hidden-gems page (top 3 genres OR'd, ★ ≥ 6.8, 150–4,000 votes, by rating)
score  += 2   if ★ ≥ 7.0 and 150 ≤ votes < 3,000        ← "good, not over-seen"
score  −= 0.5 per genre shared with any 👎 title
exclude every title on the list; rank by score, then popularity; top 50
```

**Measured** (scratch script reproducing the formula exactly, real TMDB data 2026-11-28, page 1, the
two synthetic personas from `scripts/fixtures/pair-personas.ts` "true-story", movies only, 4 seeds
each):

| | Persona A (Social Network, Moneyball, Spotlight ♥; Big Short 👍; Fast X 👎) | Persona B (Social Network, Little Women, Marriage Story ♥; Lady Bird 👍; John Wick 👎) |
|---|---|---|
| Candidates scored | 147 | 152 |
| Top 12 with the +2 bonus | **12 / 12** | **12 / 12** |
| Top 12 by source | 9 recs, 3 `/similar`, 0 gems | 10 recs, 2 `/similar`, 0 gems |
| Top 12 tied at exactly 5.0 (one Love seed + bonus) | 9 | 9 |
| Top 50 by source | 18 recs, 17 similar, 15 gems; 45 with the bonus | 14 recs, 21 similar, 15 gems; 46 with the bonus |
| Top 12 (observed) | Richard Jewell (8.0, two Love seeds), Manhattan, The Hours, Invincible, The Banker, Doubt, Rudy, Big George Foreman, She Said, The Experiment, The Hill, American Underdog | The Poseidon Adventure, Boyz n the Hood, Sense and Sensibility (2026), East of Eden, Little Women (1994), Richard Jewell, Kramer vs. Kramer, Howards End, Wuthering Heights, The Man in the Moon, …And Justice for All, Life as a House |

So, observed: **the +2 bonus decides who reaches the top.** A rec from one Love seed scores 3. With
the bonus it's 5, without it 3. Titles with ≥ 3,000 votes (blockbusters, and If I Stay at 4,385 and
Creed III at 3,054) or below ★ 7.0 can't reach 5 from one seed. **Consensus** (several seeds,
or recs + similar) then lifts titles above the 5.0 block (Richard Jewell). **Popularity** only
orders the large tied block. Suspected: with 15 seeds, as on a real account, consensus separates
more titles, but the bonus gate still applies.

Its properties. Each design below says which it keeps, and the tests show which matter for a
couple:

| | Property | Mechanism |
|---|---|---|
| P1 | **Evidence from many of your favourites**, Loves weighted ×3 | sum over up to 15 seeds |
| P2 | **Several kinds of evidence** | recs (people who liked X liked Y) + similar (content) + gems (genre and quality) |
| P3 | **Good but not famous wins** (the hidden-gem effect) | +2 for ★ ≥ 7.0 at 150–2,999 votes; gem track sorted by rating |
| P4 | **Popularity never drives**, it only breaks ties | sort key 2 |
| P5 | **Nothing you've already listed** | exclude the whole list |
| P6 | **Gentle negatives**: a 👎 nudges, it doesn't veto | −0.5 per genre |
| P7 | **Stable**: same ratings, same list | deterministic |
| P8 | **Robust**: one failed TMDB call doesn't empty the page | `Promise.allSettled` |

What it lacks for a couple: any notion of a second person, any reason line, cross-media taste
(movie Loves never seed TV), and a taste model finer than genre (the −0.5 penalty is blunt). P3 may
not transfer: a gem one person loves can be a gem the other finds slow or obscure (suspected; H4
tests it).

**Pair adaptation ("Discover-pair", approach A).** The straightforward version: run Discover
**unchanged** for each person and media type. Normalise each person's scores to 0–1 (÷ their top
score). Pair score = `min(a, b)`, with `mean` as the tiebreak, then popularity. A title missing from
one person's list scores 0 for them, so it ranks below every two-sided title and is used only if
fewer than 12 are two-sided. Movies and TV merge by pair score (the mix emerges). Reason line: "From
your Loves (X) and Laura's (Y)", naming each person's top-contributing seed. #193 ran a version of
this on the synthetic pair and got 0.14 expected bad picks per draw vs 0.60 for today's pool
(`docs/research/watch-together-matching.md`, "Comparison").

## 3. The decision map (first principles)

**What a good pick is.** For **one person**: a title they haven't seen, would enjoy, would choose
*tonight* (it fits the time, mood and services they have), and wouldn't have found anyway. For a
**pair**: a title **both** would enjoy, where neither is merely tolerating it, plus a reason both
believe because it's true and about them both. A bad pick costs more than a missing one: one "why
would it show me *that*?" makes people distrust the whole row (owner feedback in #193 and #206).

The issue's examples are decisions 4 (threads and how titles map to them), 9 (how strongly both
must like a thread), 8 (threads and slots), 6 (weak fill) and 7 (wording). The rest come from first principles, Discover's analysis and the failures so far.
Ranked by impact on what the owner and Laura see:

| Rank | Decision | Why it matters | Applies to | Today | Lean | Probe |
|---|---|---|---|---|---|---|
| 1 | **What a pick must rest on** (eligibility) | Decides whether a pick can be one-sided at all. It's the #206 complaint | pair (solo: "one of my threads") | anything (15 lines, 10 kinds) | shared thread or both-wanted; the rest is capped fill | **R1** |
| 2 | **Quality / novelty gate** (Discover's bonus) | It's what makes solo Discover "unearth gems" (§2). For a couple, obscure may read as random | all | Discover only; pair uses ★ floors | keep it in all arms; test whether gems are as good for both as better-known titles | **R1** (H4) |
| 3 | **Candidate sources** | A pick can't beat its pool. Popular discover and rec noise caused 5 of 7 labelled bad picks (#193) | all | pair: recs + popular discover + wants | Discover's three tracks per person + thread discover + wants; no popular fill | **R1** (A, D vs B) |
| 4 | **Taste representation**: genres, curated threads, creators, era/tone | Genres can't tell If I Stay from Trumbo (§1) | all | genres | curated threads + genres; creators as a thread type | **R1** |
| 5 | **Combining two tastes**: least misery, average, both above a bar | Decides whether a title one loves and the other tolerates gets through | pair, Decide | `0.7·min + 0.3·mean` | both above a bar, then `min` | **R1**, **R2** (bar) |
| 6 | **Not enough good picks**: fewer cards, weak fill, wider threads, rate-more nudge | Fill is where "Highly rated" / "Popular right now" come from | all | fill to 12 | ≤ 2 honestly worded weak fills, else fewer + "rate 3 more" | **R1** (counted), **R2** (0 vs 2 vs 4) |
| 7 | **Explainability (reason wording)** | Reasons are how people forgive a miss. A false "Because you both loved…" is what annoyed the owner | all (Discover has none) | seed or source line | thread + one named title each | **R1** (accuracy), **R2** (wording) |
| 8 | **Diversity / slots per thread** | Without it one strong thread fills the row ("all true stories") | all lists | ≤ 3 per seed | 4 threads × 3 | **R2** |
| 9 | **How strongly both must like a thread** (threshold) | Too loose = noise threads; too strict = no threads for a thin account | pair | – | ≥ 2 points each, ≤ 1 👎 (§3.3) | **R2** |
| 10 | **Negative signals and decay** | One missing negative lets a category through (Minions & Monsters) | all | −0.5 / genre (Discover), caps (pair) | P6 gentle penalty + a thread veto at 2+ 👎; no decay yet | R2 |
| 11 | **Novelty vs familiarity** ("seen it") | Seen picks waste slots; too obscure looks random | all | gem bonus (Discover) | measure the seen rate; aim ≤ 25% | R1 (measured) |
| 12 | **Cold start / thin data** (< 5 ratings, or one rich + one thin) | Threads need ≥ 2 rated titles per person | all | trending / contextual; pair banner | the richer person's threads, checked against the thinner one's genres, said honestly | R3 |
| 13 | **Context: mood, time, services, media** | Right title, wrong night | mood, pair | discover filters | filters after eligibility, never a source | R3 |
| 14 | **Movies vs TV mix** | Standing rule: emerges from traits, never quotas | all | emerges | threads are media-agnostic | R1 (recorded only) |
| 15 | **Stability across shuffles** | Shuffle should bring new, equally good picks | pair, mood | rank² draw, top 36 | draw within thread slots; Discover stays deterministic (P7) | R2 |
| 16 | **Recency and rewatch** | Taste drifts; pairs sometimes want comfort rewatches | all | pair: recent Loves; Discover: rating order | small recency weight on seeds; rewatch out of scope | R3 |
| 17 | **Feedback loops / filter bubbles** | Threads reinforce themselves | all | none | one labelled "Something different" slot from an adjacent thread | R3 |
| 18 | **Per-spot presets** (Discover, Just me, pair, Decide, More like this) | One engine, different goals | per spot | 7 separate logics (#202 K8) | one engine with presets (#202) | Phase 3 |
| 19 | **Cost and latency** | Threads need keywords for rated titles, which is the expensive part | all | Discover 26/type; pair ≤ 46 | §4 cost rows | design only |
| 20 | **Privacy of reasons** | A pair reason must never reveal a 👎 or Not for me | pair | §5.5 rules | unchanged | design only |

"Probe" says which test round answers it (§6.5). "Design only" means it's settled by reasoning or
cost, not by testers.

### 3.1 What a "thread" is (decision 4)

| Option | How | For | Against |
|---|---|---|---|
| T1 Raw TMDB keywords | each keyword is a thread | free, specific | noisy, sparse, matches on *twins* (§1, #193) |
| T2 **Curated keyword groups (+ genre)** | ~30–40 named threads, each a set of keyword ids and an optional genre, e.g. *True stories* = {based on true story, biography, docudrama, based on memoir}; *Film noir*; *Teen & YA*; *Police procedural*; *Sports*; *Addiction*; *Period drama*; *Legal*; *Journalism*; *Con artists*… | explainable, stable, stoplists the noise | a hand-kept map with coverage gaps |
| T3 Creators / cast | director, writer, showrunner, lead | precise ("Sorkin"), great reasons | rarely shared across two people; credits call per title |
| T4 Era / tone | decade + tone keywords (*witty*, *gloomy*) | "style" | TMDB tone tags inconsistent |
| T5 Hand or AI labels | a person or an LLM tags titles | best quality | doesn't scale by hand; an LLM adds cost and non-determinism (later option) |
| T6 TMDB co-rec clusters | titles that recommend each other | no curation | unexplainable; it's the noise we're escaping |

**Lean: T2, with T3 as an extra thread type and T4 as a modifier.** Genres stay as the fallback.

### 3.2 How titles map to threads

A title is in every thread it has at least one keyword for (and the thread's genre, if one is set),
so it can be in several. Membership is 0/1 in round 1. Weighting by the number of matching keywords
is a round 2 option. Titles with no thread keyword fall back to genre traits.

### 3.3 "Sufficiently liked by both" (decision 9)

Per person and thread, points = ♥ 2, 👍 1, 👎 −2, want/watching 0.5. **Shared** = each person has ≥ 2
points, at least one ♥ or 👍, and ≤ 1 👎 in it.

| Option | Rule | Risk |
|---|---|---|
| S1 | ≥ 1 👍 each | one Like makes a thread |
| **S2** (lean) | ≥ 2 points each, ≤ 1 👎 | few threads for a thin account |
| S3 | above each person's median thread score | always yields threads, even weak ones |
| S4 | shrunk mean `sum / (n + 2)` > 0.3 | hard to explain |

### 3.4 Threads and slots (decision 8)

3 × 4, **4 × 3** (lean), 6 × 2, or proportional to joint strength. Spare slots go to both-wanted
titles, then weak fill. No per-media slots.

### 3.5 Weak reasons (decision 6)

Weak = rests on one person (rows 3, 4, 7) or on no one (8–10). Options: **W0** none (show fewer and
nudge to rate); **W2** (lean) ≤ 2, only if the other person's genre affinity is ≥ 0.5, worded
honestly ("From Laura's list · you liked other true stories"); **W4**; **W∞** (today). "Highly
rated" and "Popular right now" become the last resort.

### 3.6 Reason wording (decision 7)

| Option | Example |
|---|---|
| R-seed (today) | "Because you both loved The Social Network" |
| R-thread | "You both like true stories" |
| **R-thread + evidence** (lean) | "True stories · you loved The Social Network, Laura loved Beautiful Boy" |
| R-chips | `True story` `Biography` |

Privacy (§5.5 of `docs/specs/watch-together-decide.md`): name only ♥/👍 titles; never dislikes,
Not for me or scores.

### 3.7 Other decisions in brief

- **Sources (3).** A and D use Discover's three tracks (P2) as they are. #193 F7 found `/similar`
  lists near-identical across seeds, so its "agreement" is partly a generic prior towards acclaimed
  classics (The Poseidon Adventure is persona B's #1 via `/similar`). Whether that helps a couple
  is an R2 question (the leader with and without `/similar`). Removing it on theory alone brought If
  I Stay back in #193. Popular discover goes as a pair source (#193: most of the win).
- **Negatives (10).** Gentle penalties (P6), plus a per-thread veto at 2+ 👎 from one person. Not for me
  stays a hard exclude. No decay yet: the accounts are suspected to be too young for old ratings to
  mislead.
- **Cold start (12).** If one person has < 2 eligible threads, use the richer person's threads checked
  against the thinner person's genre affinity, and say so ("From your favourites · fits Laura's taste
  so far"). R3 tests this by thinning one account in the exported file.
- **Filter bubble (17).** An optional "Something different" slot from a thread *one* person likes and
  the other hasn't rated. R3.
- **Per spot (18).** Threads extend naturally: solo Discover = Discover + thread reasons (and
  optionally rows per thread); Just me = your threads filtered by mood; More like this = the seed's
  threads ranked by your affinity; Decide = the pair's top 30.

## 4. Candidate approaches

Shared by all: exclude everything on either list (P5), poster required, the #201 kids/language caps,
`Promise.allSettled` (P8), mood "any" in round 1.

### Today's pair pool (context only, not rated)

The generator also runs today's `buildPairPool` + `drawPairPicks` and reports each arm's overlap
with it and its cost. It isn't on the sheet: the owner has already judged it (#193, #206), and
36 marks is the 10-minute limit.

### A. Discover-pair: Discover per person, then combined

**How.** As in §2: Discover unchanged for each person and media type, scores normalised, pair score
`min(a, b)`, `mean` tiebreak, then popularity. Two-sided titles first; one-sided only to reach 12.
Reason: "From your Loves (X) and Laura's (Y)".

**Keeps** P1–P8. **Failure modes.**
- A seed both people loved puts its whole rec list on both sides. Only the bonus gate keeps If I
  Stay out (4,385 votes), so a noisy rec with < 3,000 votes and ★ ≥ 7 gets through. Scarlet Street
  (470 votes, ★ 7.6) and Elmer Gantry (211, ★ 7.3) both qualify for the bonus.
- `/similar` adds the same classics for everyone (F7).
- No idea of *what* is shared, so the reason can only name seeds, and two-sided can still mean
  "loved by one, tolerable to the other" (H3).

**Cost (cold).** 26 calls per person per type = 104 for both types. These are shared with each
person's own Discover page when the URLs match (24 h cache). Latency suspected 2–3 s cold through
the 6-wide limiter; near zero warm. **Extends to:** solo is today's Discover; mood = filter after;
More like this = one seed.

**Variant A′** (#193's tweaks: distinct-seed agreement, no `/similar`, ≤ 6 seeds per person) is an
R2 option only: in #193, removing `/similar` brought If I Stay back (0.47 expected bad).

### B. Shared threads

**How.** Fetch keywords for each person's rated titles and map them to threads (§3.1–3.3). Rank the
shared threads by `min(points A, points B)`. For each of the top 4: candidates = thread discover
(`with_keywords=<thread ids>`, ★ ≥ 6.5, ≥ 300 votes, F3 filters, page 1 per media type) + TMDB recs
of rated titles in that thread that are themselves in the thread. Score = least misery of thread
affinity + a quality term (Discover's bonus, so B isn't penalised for lacking it); popularity as the
tiebreak. 3 per thread. Reason: R-thread + evidence.

**Keeps** P3–P8, not P1/P2. **Failure modes.**
- Evidence comes from themes, not from many specific favourites.
- Thread discover leans famous (#193 F5: Titanic, Schindler's List…), so expect a higher seen rate.
- Gaps in the map are invisible.
- Thin accounts get zero threads.

**Cost (cold).** Keywords for every rated title, suspected 100–300 per pair (cacheable for 7 days;
in the app it needs a keywords column or a recent-Loves cap, owner decision 4). Plus thread discover
8, recs ≤ 12, candidate keywords ≤ 40. **Extends to:** solo (your top threads), mood (threads
filtered by tone) and More like this (the seed's threads), all naturally.

### C. Reason-tier rules on today's pool

Rank by reason tier (both > shared seed > one person > none), weak tiers capped at 2. Cheapest (S),
but it inherits TMDB rec noise (If I Stay is tier 2). **Not tested on its own.** Its cap becomes
D's W2 rule.

### D. Hybrid: A's candidates, a shared-thread gate, thread reasons

**How.**
1. **Candidates and scores** from A, unchanged.
2. **Gate:** a candidate must be in a shared thread (its keywords, one cached call each) or on both
   want lists. Others drop, except ≤ 2 weak fills (W2).
3. **Order:** A's pair score. Thread fit (how strongly both like the candidate's best shared
   thread) breaks ties before popularity. Ties are large (§2: 9 of 12 at 5.0), so this reorders
   without overriding the scores.
4. **Slots:** ≤ 3 per thread.
5. **Reason:** R-thread + evidence, naming the seed if it's in that thread ("True stories · like The
   Social Network, which you both loved").
6. **Top-up:** if fewer than 12 pass the gate, add a thread-discover page per shared thread (+1.5,
   like gems).

**Keeps** P1–P8. **Failure modes.**
- Gaps in the thread map drop good recs (Good Will Hunting shares nothing curated with The Social
  Network, #193 F1).
- Profile keyword cost as in B.
- The most moving parts: if it wins, R2 must find which part earned it.

**Cost (cold).** A's 104 + candidate keywords ≤ 60 + profile keywords (as B). **Extends to:** solo
(D-solo = Discover gated to your threads, with thread reasons), mood, More like this.

### Comparison

| | Discover's properties | Rests on both? | Stops If I Stay? | Stops Scarlet Street-type noise? | Reasons | Cold calls (pair) | Build |
|---|---|---|---|---|---|---|---|
| Today (context) | none | sometimes | no | no | mixed, often one-sided | ≤ 46 | – |
| **A** Discover-pair | all | two-sided first | yes (bonus gate) | **no** (gets the bonus) | seed names | ~104 (shared cache) | M |
| **B** Threads | P3–P8 | yes (thread) | yes | yes (*film noir* ≠ shared thread, unless both like noir) | thread + evidence | ~60 + profile kw | L |
| C Tiers | none | mostly | no | no | unchanged | ≤ 46 | S |
| **D** Hybrid | all | yes (thread or both lists) | yes | yes | thread + evidence | ~164 + profile kw | L |

**Why round 1 tests A, B and D.** A is the owner's favourite logic made pairwise, the simplest
serious option. B is "threads first" in pure form. D asks whether A's evidence plus a thread gate
beats both. C and A′ are one-switch changes, so they're round 2 variants.

## 5. Hypotheses and pass marks (written before testing)

The criteria come from what makes a pick good **for the two of them**, and every approach is judged
by the same marks.

Each person marks each pick **Good**, **Meh**, **Bad**, **Seen – liked** or **Seen – didn't**, then,
after the verdict, whether the reason is right (**Yes / No**). Per approach (12 picks):
- *Unseen* = nobody marked Seen. *Joint good* = both Good. *Bad* = either Bad. *Split* = one Good,
  one Meh.
- *Joint-good rate* = joint good ÷ unseen. *Reason accuracy* = Yes ÷ picks, per person.
- *Seen rate* = picks either has seen. *Gem* = a pick with < 3,000 votes.

**Pass mark (any approach):** joint-good rate ≥ 2/3 (≈ 8 of 12), **0 Bad from either person**,
reason accuracy ≥ 10/12 for each person, seen rate ≤ 25% (≤ 3 of 12).

| # | Hypothesis | Pass mark / what would show it |
|---|---|---|
| H1 | **A pick resting on a shared thread is better for both than one that doesn't.** | Pooled over all arms: joint-good rate of thread-eligible picks ≥ non-eligible + 25 points, and ≥ 80% of Bad picks are non-eligible. (The generator tags eligibility for every pick, A's too.) |
| H2 | **D passes the pass mark.** | as above |
| H3 | **Per-person consensus (A) is often one-sided for a couple.** | A has ≥ 3 splits, or more splits than D |
| H4 | **Hidden gems suit the couple as well as better-known titles.** | Pooled: gems' joint-good rate ≥ non-gems' − 10 points. If false, the couple preset should soften the bonus |
| H5 | **Thread reasons are believed more than seed reasons.** | D's and B's reason accuracy ≥ A's + 2 picks, for both people |
| H6 | **Pure threads lean famous.** | B's seen rate > A's and D's |
| H7 | **Movies/TV mix stays natural.** | recorded only |

**Decision rule.** Among the approaches that meet the pass mark: the most joint good, then the
fewest splits, then reason accuracy, then lower cost. If none passes, take the one with the fewest
Bad (then most joint good) into round 2 and change one thing at a time. If H1 fails, threads aren't
the answer, and round 2 revisits decision 1 before tuning anything.

**Honest limits.** 12 picks and 2 people is a screen, not a statistical test. A gap of 1–2 picks
is noise. For example, 8/12 vs 5/12 isn't significant (Fisher's exact test, p ≈ 0.4). The pooled
hypotheses (H1, H4) use all ~36 picks and are a little firmer. Nothing gets built before a
**confirming round** with fresh picks, and Bad picks weigh most, since one Bad is what breaks trust.

## 6. Experiment protocol

The owner runs three commands. Only the owner and Laura see titles and verdicts. Agents get counts,
plus per-pick details only if the owner chooses.

### 6.1 Export (owner-run): `scripts/reco/export-my-ratings.ts`

- `DATABASE_URL='<production url>' npx tsx scripts/reco/export-my-ratings.ts --email <owner> --as A
  --email <laura> --as B --name B=Laura --out ~/reco-study/ratings.json`
- The connection string is used for that one command and never saved. The script first runs
  `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, so Postgres refuses any write
  ([PostgreSQL: SET TRANSACTION](https://www.postgresql.org/docs/current/sql-set-transaction.html)),
  and it only runs `SELECT`s.
- Output per person: `{ as, name?, entries: [{ title, tmdbId, mediaType, rating, list, added }] }`.
  `list` = want / watching / watched / not for me. `added` is the month (YYYY-MM): the one field
  beyond the issue's list, because seed order and decision 16 use recency (owner decision 1).
- **Never exported:** emails, user ids, review text, platform, episode progress, anyone else's rows.
- `~/reco-study/` is **outside the repo**, so nothing can be committed by accident. Laura agrees
  before her ratings are exported.

### 6.2 Generate (owner-run): `scripts/reco/generate-round.ts`

- `npx tsx scripts/reco/generate-round.ts --ratings ~/reco-study/ratings.json --arms A,B,D --per 12
  --seed 1 --out ~/reco-study/round-1/`
- Uses the **dev TMDB key** in `.env.local`, with a disk cache in the out folder (reruns are free and
  reproducible). Arms live in `scripts/reco/arms/*.ts` as prototype code, not in `lib/`, so the app
  is unchanged. A's per-person step must reproduce the production Discover routes exactly (a golden
  test on a fixture). Thread map v1: `scripts/reco/threads.ts`.
- Writes:
  - `sheet.csv`: one row per **unique title** (a title two arms both picked appears once and counts
    for both), shuffled with the seed. Columns: `#`, poster
    (`=IMAGE("https://image.tmdb.org/t/p/w154/…")`, which Sheets renders), title (year ·
    Movie/TV), **verdict**, reason (one line per arm when reasons differ), **reason right?**, note.
  - `key.json`: per title, the arms that picked it, rank, thread eligibility, gem flag, sources,
    score and reason. The owner doesn't open it until both sheets are done.
  - `run.json`: parameters, TMDB calls and time per arm, overlap with today's pool.

### 6.3 Review (owner and Laura, ~10 minutes each, ≤ 36 marks)

**Format: one private Google Sheet, a tab per person** (import `sheet.csv` twice). The owner adds
dropdowns (Data → Data validation → Dropdown) on verdict (Good, Meh, Bad, Seen – liked, Seen –
didn't) and "reason right?" (Yes, No). Each fills only their own tab and doesn't discuss it until
both are done.

Prompt on the sheet: "Would you want to watch this **with the other person**, tonight or soon? Mark
the title first, then read the reason and say if it's right."

Why a Sheet: it works on a phone and a laptop, both testers have Google accounts, `=IMAGE` shows the
posters, and it stays private to the two of them. The alternative is a self-contained HTML page that
hides the reason until a verdict is tapped (better blinding), but opening a local HTML file on a
phone is awkward. That's an R2 upgrade if reasons seem to sway verdicts.

### 6.4 Score (owner-run): `scripts/reco/score-round.ts`

- The owner downloads each tab as CSV into the round folder, then runs
  `npx tsx scripts/reco/score-round.ts ~/reco-study/round-1/`.
- It prints **counts only** per arm (joint good, Bad, splits, seen, gems, reason accuracy per person,
  movies/TV split, cost), the pooled H1/H4 numbers, and pass/fail per hypothesis. It has no titles,
  so it's safe for a GitHub issue (the repo is public).
- It also writes `details.md` (titles, verdicts, reasons, threads) for the owner, to paste into a
  **local** agent session only if they want help with round 2. Never into an issue or PR.

### 6.5 Round plan

| Round | Arms | Probes (decision #) | Exit |
|---|---|---|---|
| **R1** | A, B, D × 12 | 1 eligibility (H1), 2 gems for a couple (H4), 3 sources, 4 taste, 5 combining (H3), 6 fill (counted), 7 reasons (H5), 11 seen rate (H6), 14 mix | the leader by §5 |
| R2 | 3 one-switch variants of the leader, R1 titles excluded. E.g. if D: threads 4×3 vs 6×2; bar S2 vs stricter; fill W0 vs W2; with/without `/similar`; softer gem bonus if H4 failed. If A: + reasons only, A′, + tier caps (C) | 5 bar, 6 cap, 7 wording, 8 slots, 9 threshold, 10 negatives, 15 stability | best variant |
| R3 | confirm: R2 winner vs the R1 runner-up, fresh picks (seed 2); **solo** per person (today's Discover vs the winner's solo form, 8 each); one mood ("light"); one account thinned to 5 ratings in the file | 12 cold start, 13 context, 16 recency, 17 exploration slot, 18 per-spot | pass mark met in R1/R2 and again in R3 → Phase 3 spec |

At most 4 rounds. If R3 doesn't confirm, stop and report. Counts go into `docs/recommendations.md`
("Owner feedback"). Bad titles become anonymised eval labels (as `scripts/fixtures/pair-labels.ts`)
only with the owner's OK. Solo Discover changes only if the winner's solo form does at least as well
for that person in R3.

### 6.6 How this fits #202

#202's engine layout (`lib/reco/`, presets, one profile, Discover extracted unchanged with golden
tests first) still holds. This study decides **what goes on top of it for pairs**: the thread map,
an eligibility gate and reasons, if threads win. #202's `RecoFeedback` table isn't needed for these
rounds, since the Sheet replaces it.

## 7. Recommendation for round 1

- **Arms:** A, B, D, 12 pair picks each, mood "any", both media, services off.
- **A:** Discover's production logic per person unchanged (15 seeds, recs ×3/×1, similar ×0.7 over
  10 seeds, gems, +2 bonus, −0.5 per disliked genre, popularity tiebreak). Pair = `min` of
  normalised scores, `mean` tiebreak.
- **B:** top 4 shared threads × 3, thread discover + in-thread recs, least misery + quality term.
- **D:** A + thread map v1 (T2 + creators), bar S2, ≤ 3 per thread, fill W2, thread fit as the first
  tiebreak, R-thread + evidence.
- **Pass marks:** §5, unchanged once data arrives.
- **Effort:** export S, thread map S, generator M–L (A golden test + 3 arms + sheet), scorer S. About
  3–4 worker PRs, then one owner session of ~30 minutes (export, generate, two sheets, score).

## 8. Decisions for the owner

1. **Laura's consent, and the "month added" field.** Recommendation: include the month. It's needed
   to test recency (decision 16) and identifies no one.
2. **Who sees per-title results?** Recommendation: counts go in the GitHub issue, titles stay with
   you, and you paste `details.md` into a local agent session only when you want help with round 2.
3. **Google Sheet or HTML page?** Recommendation: the Sheet, because it works on a phone.
4. **Profile keywords in the app (Phase 3, only if D or B wins).** Either a keywords column on
   `Movie`/`TVShow` (a schema change, one call per title ever) or keywords for the 20 most recent
   Loves per person (no schema change, ~40 cached calls). Not needed until round 2.

## Sources

- Code at `main` 9b28aba: `app/api/movies/recommended/route.ts`, `app/api/tv/recommended/route.ts`,
  `lib/tmdb.ts` (`discoverHiddenGems`, `discoverHiddenGemTV`), `lib/pairPool.ts` (`reasonFor`
  778-810, constants 35-63), `lib/pairTaste.ts`, `lib/traits.ts`, `scripts/pair-eval.ts`,
  `scripts/fixtures/pair-personas.ts`, `scripts/fixtures/pair-labels.ts`.
- Measurements: a scratch script (not committed) reproducing Discover's movie formula, and TMDB
  keyword/recommendation lookups, all with the dev key on 2026-11-28. TMDB data changes over time.
  API reference: https://developer.themoviedb.org/reference/movie-keywords (read 2026-11-28).
- TMDB rate limits: https://developer.themoviedb.org/docs/rate-limiting (soft ~40 req/s; via #193,
  read 2026-11-27).
- PostgreSQL read-only sessions: https://www.postgresql.org/docs/current/sql-set-transaction.html.
- Prior work: `docs/research/watch-together-matching.md` (#193), PR #202 (reference only), owner
  feedback in #193 and #206.
- Background, not relied on for numbers: "least misery" for group recommendation (Masthoff, *Group
  Recommender Systems*, in *Recommender Systems Handbook*, Springer); diversity by maximal marginal
  relevance (Carbonell & Goldstein, SIGIR 1998).
