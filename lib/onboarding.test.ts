import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_ONBOARDING_IDS,
  ONBOARDING_CLUSTERS,
  ONBOARDING_MOVIE_IDS,
  parseOnboardingIds,
} from "./onboarding";

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

describe("curated onboarding list", () => {
  it("has unique integer ids, one per movie shown", () => {
    const shown = ONBOARDING_CLUSTERS.flatMap((c) => c.movies.map((m) => m.id));
    expect(ONBOARDING_MOVIE_IDS).toEqual(shown);
    expect(new Set(ONBOARDING_MOVIE_IDS).size).toBe(ONBOARDING_MOVIE_IDS.length);
    expect(ONBOARDING_MOVIE_IDS.every(Number.isInteger)).toBe(true);
  });

  // Both onboarding UIs must read the shared list, not keep their own copy: a stale
  // copy would show movies the API rejects (or never offer ones it accepts).
  it.each(["app/onboarding/page.tsx", "components/movies/OnboardingModal.tsx"])(
    "%s uses ONBOARDING_CLUSTERS instead of its own list",
    (file) => {
      const src = readFileSync(join(__dirname, "..", file), "utf8");
      expect(src).toMatch(/import \{[^}]*ONBOARDING_CLUSTERS[^}]*\} from "@\/lib\/onboarding"/);
      expect(src).not.toMatch(/\bid:\s*\d+/);
    },
  );
});
