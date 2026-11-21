# Mood picker quality check

How well do the mood picker's suggestions match the moods? Unit tests prove the
filters are *applied*; this checks whether the results *feel right*.

## How to run it

```bash
npm run eval:moods > /tmp/moods.md
```

`scripts/mood-eval.ts` runs the real mapping (`lib/moodPicker.ts`) against TMDB for a
fixed set of mood combinations and samples 12 titles from each pool, built the same way
as the app. It prints a table with a blank **Fits?** column. When time is limited it
also looks up each title's real runtime. For "Both" it reports the movie/TV split. It
only calls TMDB and never touches the database.

Rate each title ✓ (fits), ~ (borderline) or ✗ (doesn't fit).
Score = (✓ + ½ × ~) ÷ titles. Re-run after any change to the mapping and compare.

## Baseline — 2026-11-21 (PR #25 mapping)

Rated by Claude on a first pass; worth a human second opinion. This used the original
"Short" toggle (movies ≤ 100 min, episodes ≤ 30 min), since replaced by a single
time-available rule (see below). Tone results are unaffected.

| Combination | Pool | Mood fit | Misfits |
|---|---|---|---|
| Light · Movies | 3202 | **46%** | Titanic, Pulp Fiction, Whiplash, Demon Slayer, Chainsaw Man, Batman: Knightfall |
| Light · TV | 1220 | **71%** | Bleach, Legend of Korra (~Shameless, Desperate Housewives) |
| Intense · Movies | 2414 | 96% | (~Shawshank) |
| Intense · TV | 1106 | 75% | ~NCIS, NCIS: LA, CSI: Miami, Magnum P.I. — cosy procedurals |
| Light + Short · Movies | 1661 | 100% | — |
| Light + Short · TV | 716 | **71%** | JoJo, Naruto Shippūden, Gurren Lagann |
| Intense + Short · Movies | 785 | 92% | Gone with the Wind |
| Short · TV | 787 | 100%* | *mood-neutral; 7 of 12 are anime |
| Something new · Movies | 336 | 100% | — (all 2026) |
| Intense + Something new · TV | 80 | 100% | — |
| Light + On Netflix · Both | 625 | **71%** | 365 Days, Cruel Intentions, JoJo |
| Everything ticked · Movies | 13 | 83% | ~4 true-crime documentaries |

### Movie / TV mix ("Both")

Movies and TV are one catalogue judged on the same traits, so the split is an
**outcome to check, not a target**:

- **Time available** is one runtime rule for a film or a single episode
  (`~30 min` → ≤ 30, `Under 2 hrs` → ≤ 120). With half an hour, 22-minute episodes
  qualify and feature films don't, because of their runtime, not their type.
- **Pool building** (`blendPools`): each type's share of the 60-title pool follows how
  many of its titles TMDB says match. It used to be a fixed 60 + 60.
- **Picking** (`traitScore`): a weighted random draw on tone fit (how strongly the
  genres match the mood) and vote-adjusted rating. There's no movie/TV quota.

| "Both" with… | Pool (movies / TV) | Picks per set of 5 (avg of 20 shuffles) |
|---|---|---|
| ~30 min | 6 / 54 | 0.5 movies + 4.5 TV (the odd Pixar short) |
| Light + ~30 min | 5 / 55 | 0.45 + 4.55 |
| Intense + Under 2 hrs | 45 / 15 | 4 + 1 |
| Light (any time) | 43 / 17 | 3.85 + 1.15 |
| Intense (any time) | 41 / 19 | 3.7 + 1.3 |
| Something new | 39 / 21 | 3.45 + 1.55 |
| Light + On Netflix | 32 / 28 | 2.85 + 2.15 |

With no time limit, movies outnumber TV because more movies match on TMDB, and a free
evening fits either. A short time window tips it to TV. An earlier version forced every
set to alternate movie/TV; that was removed as a quota in disguise.

### Runtime (time available)

| | ≤ limit | Over by ≤ 10 min | Way over |
|---|---|---|---|
| Movies (≤ 100 min, old "Short"), 36 sampled | 20 | 14 | 2 — Gone with the Wind (238), Scarface (170) |
| TV episodes (≤ 30 min), 24 sampled | 24 | 0 | 0 |

TMDB's `with_runtime` filter on discover is unreliable for movies. Most misses are
slightly over, but a few are badly wrong. At `~30 min` the movies that match are
genuine short films (checked: 7–30 min).

## Findings

1. **"Light" is the weak spot.** It matches *any* of Comedy/Animation/Family/Romance/Music,
   so a single loose genre lets in tragedies (Titanic: Romance), crime (Pulp Fiction:
   Comedy), action anime (Animation) and Whiplash (Music).
2. **Experiment:** requiring **Comedy or Family** and excluding **Thriller and Crime**
   (plus the existing Horror/War) raised Light · Movies to ~96%, Light · TV to ~96%,
   Light + short TV to ~92% and Light + Netflix to ~100%. Pools stayed large (2025 /
   935 / 485 / 418). Trade-off: some light-ish titles drop out (Spider-Verse, About
   Time, Glass Onion). *Not applied yet.*
3. **"Intense" TV includes comfort procedurals** because Crime covers both *Luther* and
   *NCIS*. Genres can't separate these; TMDB keywords might.
4. **Time-limited movies need a runtime check** on the 5 titles actually shown (5 cached
   detail calls) if 3-hour films are unacceptable.
5. **"Heavy drama" has no home.** "Intense" means thrillers, action, horror and crime, and
   leans towards blockbusters (Avatar, Infinity War). A serious drama (Drama without
   Comedy) only appears by accident. A separate "Heavy" mood may fit "we have the
   evening and the energy" better.
6. **Intense + everything** pulls in true-crime documentaries; excluding Documentary
   (99) from "Intense" would fix it.
