// Pair taste model for Watch Together (spec docs/specs/watch-together-decide.md
// §5.1) — pure, no network or database.
//
// Each person's history becomes a profile of trait weights. A candidate's
// affinity for one person is how well its traits match that profile, shrunk
// towards neutral (0.5) when they have little history. Two affinities blend
// with least-misery weighting so a title one person dislikes can't win just
// because the other loves it. Movies and TV are scored the same way: there is
// no media-type term anywhere (§4).

import type { MediaType } from "./moodPicker";
import { traitsFor, type Trait } from "./traits";

/** Statuses from WatchlistEntry / TVWatchlistEntry */
export type TasteStatus = "WANT_TO_WATCH" | "WATCHING" | "WATCHED" | "NOT_INTERESTED";

export interface TasteEntry {
  mediaType: MediaType;
  status: TasteStatus;
  /** 1 = didn't like, 2 = like, 3 = love. Anything else is ignored. */
  rating?: number | null;
  /** From the cached genres; titles without them are skipped */
  genreIds?: readonly number[] | null;
}

export interface TasteProfile {
  /** Per-trait weight, Σ signal / (n + 2) */
  weights: Readonly<Record<Trait, number>>;
  /** Entries that contributed (had a signal and at least one trait) */
  signals: number;
  /** Fewer than COLD_START_SIGNALS signals: the UI asks them to rate a few titles */
  coldStart: boolean;
}

export const COLD_START_SIGNALS = 5;
/** Signals needed for full confidence */
const FULL_CONFIDENCE_SIGNALS = 10;
/** Pseudo-count that shrinks traits seen only once or twice towards 0 */
const TRAIT_PRIOR = 2;

const RATING_SIGNAL: Readonly<Record<number, number>> = { 3: 1.0, 2: 0.6, 1: -1.0 };
const STATUS_SIGNAL: Readonly<Record<TasteStatus, number>> = {
  WATCHED: 0.2, // watched, unrated
  WANT_TO_WATCH: 0.4,
  WATCHING: 0.4,
  NOT_INTERESTED: -0.6,
};

/**
 * One entry's signal. A valid rating (integer 1–3) wins; an out-of-range one
 * (e.g. 999 from unvalidated input, security finding F5) is ignored, so the
 * entry counts as unrated rather than as a super-Love.
 *
 * A valid rating overrides the status, whatever it is: NOT_INTERESTED with a
 * stale rating of 3 counts as +1.0. The rating is an opinion of the title
 * itself, which says more about taste than a later list change. (Such titles
 * are excluded from candidates anyway, §5.2.)
 */
export function entrySignal(entry: TasteEntry): number | null {
  const r = entry.rating;
  if (typeof r === "number" && Number.isInteger(r) && r in RATING_SIGNAL) return RATING_SIGNAL[r];
  return STATUS_SIGNAL[entry.status] ?? null;
}

export function buildTasteProfile(entries: readonly TasteEntry[]): TasteProfile {
  const sum: Record<Trait, number> = {};
  const count: Record<Trait, number> = {};
  let signals = 0;

  for (const entry of entries) {
    const signal = entrySignal(entry);
    if (signal === null) continue;
    const traits = traitsFor(entry.mediaType, entry.genreIds ?? []);
    if (traits.length === 0) continue;
    signals++;
    for (const t of traits) {
      sum[t] = (sum[t] ?? 0) + signal;
      count[t] = (count[t] ?? 0) + 1;
    }
  }

  const weights: Record<Trait, number> = {};
  for (const t of Object.keys(sum)) weights[t] = sum[t] / (count[t] + TRAIT_PRIOR);
  return { weights, signals, coldStart: signals < COLD_START_SIGNALS };
}

export const EMPTY_PROFILE: TasteProfile = buildTasteProfile([]);

export interface TasteCandidate {
  mediaType: MediaType;
  genreIds?: readonly number[] | null;
  /** On this person's want-to-watch list */
  onWantList?: boolean;
}

/**
 * One person's predicted liking for a candidate, 0–1 (0.5 = neutral).
 *  1. trait affinity: 0.5 + 0.5·tanh(1.5·mean(w[t])), traits they've never
 *     seen counting as 0
 *  2. confidence shrinkage: c = min(1, signals / 10), so little history pulls
 *     the result towards 0.5 and an empty profile is exactly 0.5
 *  3. on their want list → at least 0.8. Applied after shrinkage: it's direct
 *     evidence, so it holds even for a cold-start person.
 */
export function affinity(profile: TasteProfile, candidate: TasteCandidate): number {
  const traits = traitsFor(candidate.mediaType, candidate.genreIds ?? []);
  let raw = 0.5;
  if (traits.length > 0) {
    const mean = traits.reduce((s, t) => s + (profile.weights[t] ?? 0), 0) / traits.length;
    raw = 0.5 + 0.5 * Math.tanh(1.5 * mean);
  }
  const confidence = Math.min(1, profile.signals / FULL_CONFIDENCE_SIGNALS);
  const shrunk = 0.5 + confidence * (raw - 0.5);
  return candidate.onWantList ? Math.max(0.8, shrunk) : shrunk;
}

/**
 * Blend two affinities: mostly the less happy person (fair), partly the
 * average (still rewards a title one person is excited about).
 */
export function pairFit(a: number, b: number): number {
  return 0.7 * Math.min(a, b) + 0.3 * ((a + b) / 2);
}

export interface SourceSignals {
  /** How many of the two want it (0–2) */
  wantedBy: 0 | 1 | 2;
  /** How many people's Loves seeded it as a TMDB recommendation (0–2) */
  recSeededBy: 0 | 1 | 2;
}

/** §5.1 source boost, 0–1. A title from several sources takes the best. Discover only = 0. */
export function sourceBoost({ wantedBy, recSeededBy }: SourceSignals): number {
  const want = wantedBy === 2 ? 1.0 : wantedBy === 1 ? 0.5 : 0;
  const rec = recSeededBy === 2 ? 0.6 : recSeededBy === 1 ? 0.3 : 0;
  return Math.max(want, rec);
}

export interface PairScoreInput {
  /** affinity() for each person */
  affinityA: number;
  affinityB: number;
  /** The mood picker's quality + tone score (moodPicker.traitScore), 0–1 */
  traitScore: number;
  /** sourceBoost(), 0–1 */
  sourceBoost: number;
}

/** Final pair score, 0–1. Starting weights; the eval (§9) tunes them. */
export function pairScore({ affinityA, affinityB, traitScore, sourceBoost }: PairScoreInput): number {
  return 0.45 * pairFit(affinityA, affinityB) + 0.35 * traitScore + 0.2 * sourceBoost;
}
