# Mood picker quality check

How well do the mood picker's suggestions match the moods? Unit tests prove the
filters are *applied*; this checks whether the results *feel right*.

## How to run it

```bash
npm run eval:moods > /tmp/moods.md
```

`scripts/mood-eval.ts` runs the real mapping (`lib/moodPicker.ts`) against TMDB for
12 fixed mood combinations and samples 12 titles from each pool, the same 3 discover
pages the app uses. It prints a table with a blank **Fits?** column. For "Short"
combinations it also looks up each title's real runtime. It only calls TMDB and never
touches the database.

Rate each title ✓ (fits), ~ (borderline) or ✗ (doesn't fit).
Score = (✓ + ½ × ~) ÷ titles. Re-run after any change to the mapping and compare.

## Baseline — 2026-11-21 (PR #25 mapping)

Rated by Claude on a first pass; worth a human second opinion.

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

### Runtime ("Short")

| | ≤ limit | Over by ≤ 10 min | Way over |
|---|---|---|---|
| Movies (≤ 100 min), 36 sampled | 20 | 14 | 2 — Gone with the Wind (238), Scarface (170) |
| TV episodes (≤ 30 min), 24 sampled | 24 | 0 | 0 |

TMDB's `with_runtime` filter on discover is unreliable for movies. Most misses are
slightly over, which is fine for "short-ish", but a few are badly wrong.

## Findings

1. **"Light" is the weak spot.** It matches *any* of Comedy/Animation/Family/Romance/Music,
   so a single loose genre lets in tragedies (Titanic: Romance), crime (Pulp Fiction:
   Comedy), action anime (Animation) and Whiplash (Music).
2. **Experiment:** requiring **Comedy or Family** and excluding **Thriller and Crime**
   (plus the existing Horror/War) raised Light · Movies to ~96%, Light · TV to ~96%,
   Light + Short · TV to ~92% and Light + Netflix to ~100%. Pools stayed large (2025 /
   935 / 485 / 418). Trade-off: some light-ish titles drop out (Spider-Verse, About
   Time, Glass Onion). *Not applied yet.*
3. **"Intense" TV includes comfort procedurals** because Crime covers both *Luther* and
   *NCIS*. Genres can't separate these; TMDB keywords might.
4. **"Short" movies need a runtime check** on the 5 titles actually shown (5 cached
   detail calls) if 3-hour films are unacceptable.
5. **Intense + everything** pulls in true-crime documentaries; excluding Documentary
   (99) from "Intense" would fix it.
