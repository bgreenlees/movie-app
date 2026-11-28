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

  // TMDB ids are easy to get wrong (264644 is "Room", not "Ex Machina"), so pin every pair.
  it("maps every id to the film it is labelled as", () => {
    const actual = ONBOARDING_CLUSTERS.flatMap((c) => c.movies.map((m) => [m.id, m.title]));
    expect(actual).toEqual([
  [37799, "The Social Network"],
  [244786, "Whiplash"],
  [205596, "The Imitation Game"],
  [60308, "Moneyball"],
  [453, "A Beautiful Mind"],
  [155, "The Dark Knight"],
  [27205, "Inception"],
  [76341, "Mad Max: Fury Road"],
  [98, "Gladiator"],
  [245891, "John Wick"],
  [603, "The Matrix"],
  [157336, "Interstellar"],
  [329865, "Arrival"],
  [264660, "Ex Machina"],
  [335984, "Blade Runner 2049"],
  [278, "The Shawshank Redemption"],
  [13, "Forrest Gump"],
  [489, "Good Will Hunting"],
  [8358, "Cast Away"],
  [497, "The Green Mile"],
  [120467, "The Grand Budapest Hotel"],
  [546554, "Knives Out"],
  [8363, "Superbad"],
  [445571, "Game Night"],
  [55721, "Bridesmaids"],
  [862, "Toy Story"],
  [129, "Spirited Away"],
  [354912, "Coco"],
  [420818, "The Lion King"],
  [12, "Finding Nemo"],
  [419430, "Get Out"],
  [496243, "Parasite"],
  [274, "The Silence of the Lambs"],
  [447332, "A Quiet Place"],
  [493922, "Hereditary"],
  [313369, "La La Land"],
  [597, "Titanic"],
  [11036, "The Notebook"],
  [122906, "About Time"],
  [4348, "Pride & Prejudice"],
    ]);
  });
});
