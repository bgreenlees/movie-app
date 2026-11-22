# Mood picker quality check

How well do the mood picker's suggestions match the moods? Unit tests prove the
filters are *applied*; this checks whether the results *feel right*.

## How to run it

```bash
npm run eval:moods > /tmp/moods.md
```

`scripts/mood-eval.ts` runs the real mapping (`lib/moodPicker.ts`) against TMDB for a
fixed set of mood combinations and samples 12 titles from each, through the same
pool-building and tone/rating-weighted picker the app uses. It prints a table with a
blank **Fits?** column. When time is limited it also looks up each title's real
runtime. For "Both" it reports the movie/TV split. It only calls TMDB (key from
`.env.local`) and never touches the database.

Rate each title ✓ (fits), ~ (borderline) or ✗ (doesn't fit).
Score = (✓ + ½ × ~) ÷ titles. Re-run after any change to the mapping and compare.

## Results — current mapping (2026-11-21)

The mapping as of PR #25: Light = **Comedy or Family**, without Horror, War, Thriller
or Crime (dramedies ranked lower). Heavy = **Drama**, without Comedy, Family or
Animation, ranked lower when it is also Action/Adventure/Sci-Fi/Fantasy. Intense =
thriller/action/horror/crime/war/mystery (TV: crime, action & adventure, mystery,
war & politics, sci-fi & fantasy), without Family, Animation or Comedy.

Rated by Claude on a first pass; worth a human second opinion.

| Combination | Fit | Notes |
|---|---|---|
| Light · Movies | 100% | Toy Story, Shrek, Back to the Future, Totoro |
| Light · TV | 79% | ~Shameless, Rebelde, Ally McBeal, Buffy, One Piece: dramedies are allowed, just ranked lower |
| Light · Both | 100% | |
| Light + Under 2 hrs · Movies | 100% | |
| Light + ~30 min · Both | 92% | ~Mob Psycho 100, You're the Worst |
| Light + On Netflix · Both | 96% | ~Don't Look Up |
| Heavy · Movies | 79% | Godfather II, Joker, In the Mood for Love; ✗ F1; ~The Death of Robin Hood, Django, Michael |
| Heavy · TV | 71% | Breaking Bad, The Wire, Slow Horses, ER; ✗ The Vampire Diaries; ~Suits, House, The 100 |
| Heavy · Both | 67% | as above |

Intense and the other combinations were not re-rated after the Light/Heavy change.
Intense's mapping didn't change; run the script to rate them.

### Movie / TV mix ("Both")

Movies and TV are judged on the same traits, so the split is an **outcome to check,
not a target**.

| "Both" with… | Pool (movies / TV) | Picks per set of 5 (avg of 20 shuffles) |
|---|---|---|
| ~30 min | 6 / 54 | 0.5 movies + 4.5 TV (the odd Pixar short) |
| Light + ~30 min | 5 / 55 | 0.45 + 4.55 |
| Intense + Under 2 hrs | 45 / 15 | 4 + 1 |
| Light (any time) | 43 / 17 | 3.85 + 1.15 |
| Intense (any time) | 41 / 19 | 3.7 + 1.3 |
| Something new | 39 / 21 | 3.45 + 1.55 |
| Light + On Netflix | 32 / 28 | 2.85 + 2.15 |

With no time limit, more movies match on TMDB, so movies lead. A short time window tips
it to TV because of runtimes.

These pools were measured before PR #25 started checking each movie's real runtime
when time is limited, so time-limited movie counts may now be a little lower.

## Open findings

1. **Heavy can't separate prestige drama from soaps or blockbusters.** On TMDB nearly
   every scripted series and many blockbusters carry a Drama tag, so genres alone can't
   tell *Breaking Bad* from *The Vampire Diaries*, or *Fury* from *F1*. Ideas: TMDB
   keywords (e.g. "based on true story", "grief"), or a higher rating floor for Heavy.
2. **Intense TV includes comfort procedurals**, because Crime covers both *Luther* and
   *NCIS*. Genres can't separate these; TMDB keywords might.
3. **Intense + everything ticked pulls in true-crime documentaries.** Excluding
   Documentary (99) from Intense would fix it.
