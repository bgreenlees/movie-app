// Typo-tolerant fallback for title search. TMDB search has no spelling
// correction, so when a query returns nothing we retry with a spell-corrected
// query plus looser variants (truncated words, dropped words) and keep results
// whose titles are close to what the user typed.

import { WORDS_BY_FREQUENCY } from "./data/wordFrequency";

const MIN_SIMILARITY = 0.5;
const MAX_CANDIDATES = 6;
const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "to"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Damerau-Levenshtein (optimal string alignment) distance, so swapped
// adjacent letters ("teh") count as a single typo.
function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

function ratio(a: string, b: string): number {
  const len = Math.max(a.length, b.length);
  return len === 0 ? 1 : 1 - editDistance(a, b) / len;
}

// Compare against the full title and against a title prefix of the same
// length, so "godfathr" still matches "The Godfather Part II".
export function titleSimilarity(query: string, title: string): number {
  const q = normalize(query);
  const t = normalize(title);
  if (!q || !t) return 0;
  // Also try without a leading article, since people often skip it
  const variants = [t, t.replace(/^(the|a|an) /, "")];
  return Math.max(...variants.flatMap((v) => [ratio(q, v), ratio(q, v.slice(0, q.length))]));
}

// word -> frequency rank (0 = most common); built lazily on first use
let wordRanks: Map<string, number> | null = null;
function getWordRanks(): Map<string, number> {
  if (!wordRanks) {
    wordRanks = new Map(WORDS_BY_FREQUENCY.split(" ").map((w, i) => [w, i]));
  }
  return wordRanks;
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";

// All strings one deletion, transposition, substitution or insertion away.
function edits1(word: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    const head = word.slice(0, i);
    const tail = word.slice(i);
    if (tail) out.add(head + tail.slice(1));
    if (tail.length > 1) out.add(head + tail[1] + tail[0] + tail.slice(2));
    for (const c of ALPHABET) {
      if (tail) out.add(head + c + tail.slice(1));
      out.add(head + c + tail);
    }
  }
  return out;
}

function knownByFrequency(candidates: Iterable<string>, ranks: Map<string, number>): string[] {
  return Array.from(candidates)
    .filter((c) => ranks.has(c))
    .sort((a, b) => ranks.get(a)! - ranks.get(b)!);
}

// Norvig-style correction: known words one edit away, most common first,
// falling back to two edits away (longer words only, where two typos are
// plausible). Returns [word] unchanged when it's already a word or no fix is
// found.
export function wordCorrections(word: string, max = 3): string[] {
  const ranks = getWordRanks();
  if (word.length < 3 || /\d/.test(word) || ranks.has(word)) return [word];

  const one = edits1(word);
  let fixes = knownByFrequency(one, ranks);
  if (!fixes.length && word.length >= 5) {
    const two = new Set<string>();
    for (const e of one) for (const e2 of edits1(e)) if (ranks.has(e2)) two.add(e2);
    fixes = knownByFrequency(two, ranks);
  }
  return fixes.length ? fixes.slice(0, max) : [word];
}

// Spell-corrected versions of the query, likeliest first. The most common fix
// isn't always right ("strnger" -> "stronger", not "stranger"), so runner-up
// fixes for each word are included too.
function spellingCandidates(words: string[]): string[] {
  const corrections = words.map((w) => wordCorrections(w));
  const best = corrections.map((c) => c[0]);
  const spellings = [best.join(" ")];
  corrections.forEach((c, i) => {
    for (const alt of c.slice(1)) spellings.push(best.map((b, j) => (j === i ? alt : b)).join(" "));
  });
  return spellings.slice(0, 3);
}

export function buildFallbackQueries(query: string): string[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];

  const truncate = (w: string, keep: number) => (w.length > 3 ? w.slice(0, Math.max(3, keep)) : w);
  const candidates = [
    // Spell-corrected first: handles typos anywhere in a word ("loghtning")
    ...spellingCandidates(words),
    words.map((w) => truncate(w, Math.ceil(w.length * 0.6))).join(" "),
    words.map((w) => truncate(w, 3)).join(" "),
  ];
  if (words.length > 1) {
    words.forEach((_, i) => candidates.push(words.filter((__, j) => j !== i).join(" ")));
  }

  const original = normalize(query);
  return Array.from(new Set(candidates))
    .filter((c) => c && c !== original && !STOPWORDS.has(c))
    .slice(0, MAX_CANDIDATES);
}

// Titles close to what was typed rank highest; titles that merely contain the
// corrected words ("The Lightning Thief" for "loghtning") still qualify.
function scoreTitle(query: string, corrected: string, title: string): number {
  const t = normalize(title);
  const containsCorrected = ` ${t} `.includes(` ${corrected} `);
  return Math.max(
    titleSimilarity(query, title),
    titleSimilarity(corrected, title) * 0.95,
    containsCorrected ? 0.6 : 0
  );
}

export async function fuzzySearch<T extends { id: number; popularity: number }>(
  query: string,
  search: (q: string) => Promise<{ results: T[] }>,
  getTitle: (item: T) => string
): Promise<{ results: T[]; suggestion: string | null }> {
  const responses = await Promise.allSettled(buildFallbackQueries(query).map(search));

  const spellings = spellingCandidates(normalize(query).split(" ").filter(Boolean));
  const corrected = spellings[0] ?? "";
  const scored = new Map<number, { item: T; score: number }>();
  for (const r of responses) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value.results || []) {
      if (scored.has(item.id)) continue;
      const score = scoreTitle(query, corrected, getTitle(item));
      if (score >= MIN_SIMILARITY) scored.set(item.id, { item, score });
    }
  }

  // Rank by closeness first; popularity breaks near-ties.
  const ranked = Array.from(scored.values()).sort(
    (a, b) => b.score - a.score || b.item.popularity - a.item.popularity
  );
  const best = ranked[0];
  return {
    results: ranked.map((r) => r.item),
    suggestion: best ? suggestionFor(getTitle(best.item), spellings) : null,
  };
}

// Suggest the full title when the query was a misspelling of all of it, but
// just the corrected words when they're only part of it, so "loghtning"
// suggests "Lightning" (all lightning titles) rather than "Lightning Point".
function suggestionFor(title: string, spellings: string[]): string {
  const t = normalize(title).replace(/^(the|a|an) /, "");
  const spelling = spellings.find((s) => s !== t && ` ${t} `.includes(` ${s} `));
  if (!spelling) return title;
  return spelling.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
