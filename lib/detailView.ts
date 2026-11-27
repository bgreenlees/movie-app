// Pure helpers for the movie/TV detail pages (hero meta line, where-to-watch shelf).
import { canonicalProviderId } from "./providers";

/** 166 → "2h 46m", 45 → "45m". Null for missing or non-positive values. */
export function formatRuntime(minutes: number | null | undefined): string | null {
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0) return null;
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}m`;
  return rest === 0 ? `${h}h` : `${h}h ${rest}m`;
}

/** "2024-03-01" → "2024". Null if the date is missing or unparseable. */
export function yearOf(date: string | null | undefined): string | null {
  if (!date) return null;
  const match = /^(\d{4})/.exec(date);
  return match ? match[1] : null;
}

/** TV year span: "2019", "2019–2023" (ended) or "2019–" (still running). */
export function tvYearSpan(firstAir: string | null | undefined, lastAir: string | null | undefined, ended: boolean): string | null {
  const start = yearOf(firstAir);
  if (!start) return null;
  if (!ended) return `${start}–`;
  const end = yearOf(lastAir);
  return end && end !== start ? `${start}–${end}` : start;
}

/** "★ 8.2", or null when there's no rating yet. */
export function formatRating(vote: number | null | undefined): string | null {
  if (typeof vote !== "number" || !Number.isFinite(vote) || vote <= 0) return null;
  return `★ ${vote.toFixed(1)}`;
}

/** Joins the non-empty parts with " · ". */
export function joinMeta(parts: Array<string | null | undefined | false>): string {
  return parts.filter((p): p is string => typeof p === "string" && p.length > 0).join(" · ");
}

/** First two genre names, e.g. "Sci-Fi, Adventure". */
export function genreList(genres: Array<{ name: string }> | null | undefined, max = 2): string | null {
  const names = (genres ?? []).map((g) => g.name).filter(Boolean).slice(0, max);
  return names.length > 0 ? names.join(", ") : null;
}

interface RawProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
}

export interface ProviderOption {
  id: number;
  name: string;
  logoPath: string | null;
  /** "Stream", "Rent", "Buy" or "Rent or buy" */
  kind: string;
  /** True when the provider is one of the signed-in user's streaming services. */
  yours: boolean;
}

/**
 * Merges TMDB's flatrate/rent/buy lists into one list with a kind per provider.
 * A provider appears once: streaming wins over rent/buy, and rent + buy merge
 * into "Rent or buy". Services the user subscribes to (matched on canonical ID)
 * sort first, then streaming, then rent/buy, keeping TMDB's order within a group.
 */
export function buildProviderOptions(
  us: { flatrate?: RawProvider[]; rent?: RawProvider[]; buy?: RawProvider[] } | null | undefined,
  userServiceIds: Iterable<number> = []
): ProviderOption[] {
  if (!us) return [];
  const mine = new Set([...userServiceIds].map(canonicalProviderId));
  const byId = new Map<number, { p: RawProvider; stream: boolean; rent: boolean; buy: boolean; order: number }>();
  let order = 0;
  const add = (list: RawProvider[] | undefined, key: "stream" | "rent" | "buy") => {
    for (const p of list ?? []) {
      const id = canonicalProviderId(p.provider_id);
      const entry = byId.get(id) ?? { p, stream: false, rent: false, buy: false, order: order++ };
      entry[key] = true;
      byId.set(id, entry);
    }
  };
  add(us.flatrate, "stream");
  add(us.rent, "rent");
  add(us.buy, "buy");

  const options = [...byId.entries()].map(([id, e]) => ({
    option: {
      id,
      name: e.p.provider_name,
      logoPath: e.p.logo_path,
      kind: e.stream ? "Stream" : e.rent && e.buy ? "Rent or buy" : e.rent ? "Rent" : "Buy",
      yours: mine.has(id),
    },
    rank: (mine.has(id) ? 0 : 2) + (e.stream ? 0 : 1),
    order: e.order,
  }));
  options.sort((a, b) => a.rank - b.rank || a.order - b.order);
  return options.map((o) => o.option);
}

/** True for add-on channels sold through another store, e.g. "HBO Max Amazon Channel". */
const isChannel = (p: ProviderOption) => /\bchannel$/i.test(p.name.trim());

/**
 * The eyebrow above the title: "Movie · On Max". Picks the user's service if one streams it,
 * else the first streaming service, preferring direct services over add-on channels.
 */
export function heroEyebrow(media: "movie" | "tv", providers: ProviderOption[]): string {
  const label = media === "movie" ? "Movie" : "TV series";
  const streams = providers.filter((p) => p.kind === "Stream");
  const stream =
    streams.find((p) => p.yours && !isChannel(p)) ??
    streams.find((p) => p.yours) ??
    streams.find((p) => !isChannel(p)) ??
    streams[0];
  return stream ? `${label} · On ${stream.name}` : label;
}
