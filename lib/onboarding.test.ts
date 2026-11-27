import { describe, expect, it } from "vitest";
import { MAX_ONBOARDING_IDS, ONBOARDING_MOVIE_IDS, parseOnboardingIds } from "./onboarding";

describe("parseOnboardingIds", () => {
  it("keeps curated ids and drops everything else", () => {
    expect(parseOnboardingIds([603, 1, "155", 155, null, 603.5, 13])).toEqual([603, 155, 13]);
  });

  it("de-duplicates", () => {
    expect(parseOnboardingIds([603, 603, 603])).toEqual([603]);
  });

  it("accepts the whole curated list", () => {
    expect(ONBOARDING_MOVIE_IDS).toHaveLength(MAX_ONBOARDING_IDS);
    expect(parseOnboardingIds([...ONBOARDING_MOVIE_IDS])).toHaveLength(MAX_ONBOARDING_IDS);
  });

  it("rejects non-arrays and arrays over the cap", () => {
    expect(parseOnboardingIds(undefined)).toBeNull();
    expect(parseOnboardingIds("603")).toBeNull();
    expect(parseOnboardingIds({ 0: 603 })).toBeNull();
    expect(parseOnboardingIds(Array(MAX_ONBOARDING_IDS + 1).fill(603))).toBeNull();
  });
});
