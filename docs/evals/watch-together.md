# Watch Together pair quality check

Would **both** people like what "Tonight for you both" ranks first? Unit tests prove the
scoring maths; this checks whether the results *feel right* for a pair. Spec:
`docs/specs/watch-together-decide.md` §9.1.

## How to run it

```bash
npm run eval:pairs > /tmp/pairs.md          # markdown tables
npm run eval:pairs -- --pair similar        # one pair (ids in the fixtures)
npm run eval:pairs -- --json                # raw JSON, to diff between runs
```

`scripts/pair-eval.ts` builds two **synthetic personas** per pair
(`scripts/fixtures/pair-personas.ts`: real TMDB titles with the rating each persona would give,
no real user's data) and runs the real pair pool (`lib/pairPool.ts`, the code behind
`GET /api/watch-together/[userId]/picks`) for four moods: any, Light, Intense + Under 2 hrs and
~30 min. It prints the top 10 for each with genres and source (the reason line), then a summary.
It needs only `TMDB_API_KEY` from `.env.local` and never touches the database.

Since the 12-pick change the pool also includes shows either persona is watching and seeds
recommendations from titles both personas liked (see spec §5.2). The persona fixtures have no
WATCHING rows, so the results are only affected by the extra joint seeds. Re-run it and add marks
for any new titles before comparing numbers with the table below.

Pairs: 1 similar (crime dramas) · 2 complementary (rom-com + sci-fi) · 3 opposites (horror +
family) · 4 one cold start · 5 both cold start · 6 movie person + TV person.

**Rating.** Marks live in `scripts/fixtures/pair-ratings.json`, keyed by persona and title
(`<pair>/<a|b>/<media>-<id>` → ✓ / ~ / ✗), so each title is judged once per persona and reused
across moods. A title with no mark is left out of the metrics (the summary shows how many of the
10 were rated). After a re-run, new titles show blank columns: add marks for them and re-run.

- **Joint hit rate**: per title, the lower of the two people's marks (✓ 1, ~ ½, ✗ 0), averaged.
- **Misery rate**: share of titles where either person is ✗. Should be low.
- **Movie/TV split**: reported as an outcome, never a target.

Re-run after any weight change and add a dated section below.

## Results: first pass (2026-11-26, pair pool as of #100)

**Rated by Claude on a first pass, as each persona; this needs a human second opinion**
(especially the ✗ marks on kids' films and anime, which are judgement calls about a persona that
only has 2 to 15 ratings). All 240 titles rated (24 pair/mood combinations × 10).

| Pair | Mood | Movies / TV | Joint hit | Misery |
|---|---|---|---|---|
| 1 similar | Any | 2 / 8 | 90% | 0% |
| | Light | 10 / 0 | 25% | 50% |
| | Intense + <2 hrs | 5 / 5 | 85% | 0% |
| | ~30 min | 0 / 10 | 10% | 80% |
| 2 complementary | Any | 5 / 5 | 45% | 30% |
| | Light | 8 / 2 | 30% | 50% |
| | Intense + <2 hrs | 3 / 7 | 30% | 50% |
| | ~30 min | 0 / 10 | 30% | 40% |
| 3 opposites | Any | 5 / 5 | 30% | 40% |
| | Light | 9 / 1 | 25% | 50% |
| | Intense + <2 hrs | 3 / 7 | 5% | 90% |
| | ~30 min | 0 / 10 | 35% | 30% |
| 4 one cold | Any | 8 / 2 | 60% | 10% |
| | Light | 8 / 2 | 75% | 0% |
| | Intense + <2 hrs | 6 / 4 | 10% | 80% |
| | ~30 min | 0 / 10 | 40% | 20% |
| 5 both cold | Any | 6 / 4 | 70% | 0% |
| | Light | 9 / 1 | 60% | 0% |
| | Intense + <2 hrs | 6 / 4 | 35% | 30% |
| | ~30 min | 0 / 10 | 10% | 80% |
| 6 movie + TV | Any | 3 / 7 | 70% | 10% |
| | Light | 3 / 7 | 25% | 50% |
| | Intense + <2 hrs | 1 / 9 | 40% | 30% |
| | ~30 min | 0 / 10 | 30% | 40% |

**Overall: joint hit 40%, misery 36%.** First-pass rating: **mixed. Good when taste decides
(any mood, and Intense for the crime fans), poor when a mood or a runtime limit decides.**

### What the numbers say

1. **Taste works when the mood leaves room.** "Any mood" and "Intense + <2 hrs" for the similar
   pair score 85 to 90% with 0% misery, and the pool is real crime drama from both the lists and
   recommendations. Both cold-start pairs are fine under "any" (70%, 0% misery for pair 5), so a
   thin history falls back to sensible quality picks rather than noise.
2. **Light and ~30 min override taste.** Under Light the top 10 is mostly the same kids'
   animation for every pair: *Hoppers* is in the top 10 of 6 of the 6 pairs, *The Super Mario
   Galaxy Movie* of 5, *Toy Story 5* of 4, and 35 distinct titles appear across all six. Under ~30 min,
   57 of the 60 picks are "Highly rated" (no list or Love behind them), and the same anime
   (*Frieren*, *Jujutsu Kaisen*, *Naruto Shippūden*) is in 6 of 6 pairs. The pair's taste
   barely reorders a pool that the mood has already narrowed. That is where most of the misery is
   (Light 0 to 50%, ~30 min up to 80%).
3. **Strong mood against a gentle or opposed partner = misery.** Intense + <2 hrs is 90% misery
   for the horror/family pair and 80% for the cold-start family-leaning partner. The mood itself
   is the cause (everything left is violent), but least misery has nothing better to rank. Worth
   deciding whether the UI should say "this mood is hard for you two" rather than show 10 titles
   one of you will veto.
4. **Complementary tastes (pair 2) never get bridging titles near the top.** 45% at best. The
   hoped-for crossover titles (romantic sci-fi such as *The Time Traveler's Wife*, funny sci-fi) do
   appear, but one-sided sci-fi and crime picks sit beside them.

### Movie/TV split (an outcome, not a target)

- Pair 6 gets both types under "any" (3 / 7) and Light (3 / 7), so the catalogue is shared.
  Under Intense + <2 hrs it is 1 / 9 and under ~30 min 0 / 10.
- **~30 min is 0 / 10 films for every pair.** That is the intended runtime effect: no film
  qualifies.
- **Intense + <2 hrs leans to TV for some pairs** (films / TV: pair 2 3 / 7, pair 3 3 / 7,
  pair 6 1 / 9, but pair 1 5 / 5 and pairs 4 and 5 6 / 4), although plenty of films run under two
  hours. Worth a look: it may be the TV recommendations out-ranking films, or just the trait mix.
  It does not look like a quota problem, so no change is suggested here, only a check.
- Fixture note: recommendation seeds are each person's three *most recently added* Loves, so
  the eval interleaves movies and TV in "added" order. Written type by type, every seed was a
  series and pair 1 came out 0 / 10 films. That was a fixture artefact, not an app issue.

### Suggestions for follow-up (not done here)

- Let pair affinity reorder *within* a mood-filtered pool more strongly, or widen the pool, so
  Light and ~30 min stop returning the same titles to everyone.
- For "Highly rated" fallback picks, consider down-ranking genres neither person has any signal
  for (e.g. anime for two crime-drama fans) instead of treating unseen traits as neutral.
- Surface a hint when a mood is a poor fit for the pair.
- Add the Vitest leave-one-out proxy from spec §9.1 (it needs `lib/pairTaste.ts` ordering
  pinned in tests; not part of this task).
