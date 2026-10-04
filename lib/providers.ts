// TMDB sometimes splits a service into tiers or retires an ID. Saved services and
// the profile picker use one canonical ID per service; these helpers map around that.

// Retired provider IDs that may still be saved on user profiles
const RETIRED_IDS: Record<number, number> = {
  531: 2303, // Paramount+ → Paramount Plus Premium
};

// Tiers that should count as the canonical service
const TIER_IDS: Record<number, number> = {
  2616: 2303, // Paramount Plus Essential → Paramount+
};

export const PROVIDER_NAME_OVERRIDES: Record<number, string> = {
  2303: "Paramount+",
};

export function canonicalProviderId(id: number): number {
  return RETIRED_IDS[id] ?? TIER_IDS[id] ?? id;
}

export function canonicalProviderIds(ids: number[]): number[] {
  return [...new Set(ids.map(canonicalProviderId))];
}

// Every TMDB ID that belongs to the given canonical service, for discover filters
export function providerTierIds(id: number): number[] {
  return [id, ...Object.keys(TIER_IDS).map(Number).filter((tier) => TIER_IDS[tier] === id)];
}
