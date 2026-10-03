// Typo-tolerant fallback for title search. TMDB search has no spelling
// correction, so when a query returns nothing we retry with looser variants
// (truncated words, dropped words) and keep results whose titles are close
// to what the user typed.

const MIN_SIMILARITY = 0.5;
const MAX_CANDIDATES = 5;
const STOPWORDS = new Set(["the", "a", "an", "of", "and", "in", "on", "to"]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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

export function buildFallbackQueries(query: string): string[] {
  const words = normalize(query).split(" ").filter(Boolean);
  if (!words.length) return [];

  const truncate = (w: string, keep: number) => (w.length > 3 ? w.slice(0, Math.max(3, keep)) : w);
  const candidates = [
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

export async function fuzzySearch<T extends { id: number; popularity: number }>(
  query: string,
  search: (q: string) => Promise<{ results: T[] }>,
  getTitle: (item: T) => string
): Promise<{ results: T[]; suggestion: string | null }> {
  const responses = await Promise.allSettled(buildFallbackQueries(query).map(search));

  const scored = new Map<number, { item: T; score: number }>();
  for (const r of responses) {
    if (r.status !== "fulfilled") continue;
    for (const item of r.value.results || []) {
      if (scored.has(item.id)) continue;
      const score = titleSimilarity(query, getTitle(item));
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
    suggestion: best ? getTitle(best.item) : null,
  };
}
