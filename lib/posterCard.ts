// Pure helpers for PosterCard's caption (meta line, status chip, TV progress).
// Kept out of the component so they can be unit-tested without React.

export type MediaType = "movie" | "tv";

/** "2024 · Movie" / "2025 · TV"; just the type when there's no usable date. */
export function yearMeta(date: string | null | undefined, mediaType: MediaType): string {
  const year = date && /^\d{4}/.test(date) ? date.slice(0, 4) : null;
  const kind = mediaType === "movie" ? "Movie" : "TV";
  return year ? `${year} · ${kind}` : kind;
}

/** "S2 · E3", "S2", or null when neither is set. */
export function episodeMeta(season: number | null | undefined, episode: number | null | undefined): string | null {
  const parts = [season ? `S${season}` : null, episode ? `E${episode}` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export interface SeasonBanner {
  number: number;
  premiereDate: string | null;
  lastAirDate: string | null;
  status: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2025-03-07" → { month: "Mar", year: "2025" }. Parsed by hand, not with Date,
// so the result doesn't shift with the viewer's time zone.
function monthYear(date: string | null): { month: string; year: string } | null {
  const m = date?.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const month = MONTHS[parseInt(m[2], 10) - 1];
  return month ? { month, year: m[1] } : null;
}

/** Still airing: the season's end is "now" rather than a date. */
export function isOngoing(status: string): boolean {
  return status === "Returning Series" || status === "In Production";
}

/**
 * Compact one-line season span for a card meta line:
 * "S3 · Mar 2025 – now", "S2 · Jan – Mar 2024", "S1 · Nov 2023 – Feb 2024".
 */
export function seasonMeta(banner: SeasonBanner): string {
  const start = monthYear(banner.premiereDate);
  const end = isOngoing(banner.status) ? null : monthYear(banner.lastAirDate);
  const head = `S${banner.number}`;
  if (!start) return head;
  if (isOngoing(banner.status)) return `${head} · ${start.month} ${start.year} – now`;
  if (!end) return `${head} · ${start.month} ${start.year}`;
  if (start.year === end.year) {
    return start.month === end.month
      ? `${head} · ${start.month} ${start.year}`
      : `${head} · ${start.month} – ${end.month} ${end.year}`;
  }
  return `${head} · ${start.month} ${start.year} – ${end.month} ${end.year}`;
}

/**
 * Status chip text for My lists: Watching / Want / Seen (plus the user's
 * rating on watched titles, as the design's "Seen ★"). Null for no chip.
 */
export function statusChip(status: string | null | undefined, rating?: number | null): string | null {
  switch (status) {
    case "WATCHING":
      return "Watching";
    case "WANT_TO_WATCH":
      return "Want";
    case "WATCHED": {
      const icon = rating === 1 ? "👎" : rating === 2 ? "👍" : rating === 3 ? "♥" : null;
      return icon ? `Seen ${icon}` : "Seen";
    }
    default:
      return null;
  }
}

/** A list entry that counts as "on a list" for the ✓ (Not interested doesn't). */
export function isOnList(status: string | null | undefined): boolean {
  return !!status && status !== "NOT_INTERESTED";
}

/**
 * Fraction of the current season watched, 0–1, counting the current episode
 * as reached ("S2 · E3" of a 10-episode season → 0.3). Null when unknown.
 */
export function seasonProgress(
  episode: number | null | undefined,
  episodeCount: number | null | undefined
): number | null {
  if (!episode || !episodeCount || episodeCount <= 0) return null;
  return Math.min(1, Math.max(0, episode / episodeCount));
}

/** The full detail page a poster links to (the modal is an enhancement on top). */
export function detailHref(mediaType: MediaType, id: number): string {
  return mediaType === "movie" ? `/movie/${id}` : `/tv/${id}`;
}
