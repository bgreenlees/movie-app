import { describe, expect, it } from "vitest";
import { parseLocalHour, planContextualFeed } from "./contextualFeed";

describe("planContextualFeed", () => {
  it("gives users with no ratings the same trending feed at every hour", () => {
    for (let h = 0; h < 24; h++) {
      expect(planContextualFeed(false, h)).toEqual({ kind: "trending", label: "Trending" });
    }
    expect(planContextualFeed(false, null).kind).toBe("trending");
  });

  it("never serves horror/crime to a no-ratings user late at night", () => {
    expect(planContextualFeed(false, 2).kind).toBe("trending");
  });

  it("falls back to trending when the local hour is unknown", () => {
    expect(planContextualFeed(true, null).kind).toBe("trending");
  });

  it("uses the local-hour mood for users with ratings", () => {
    expect(planContextualFeed(true, 3)).toMatchObject({ kind: "genres", label: "Late Night" });
    expect(planContextualFeed(true, 9)).toMatchObject({ kind: "genres", label: "Morning" });
    expect(planContextualFeed(true, 20)).toMatchObject({ kind: "genres", label: "Evening" });
  });
});

describe("parseLocalHour", () => {
  it("accepts 0-23 and rejects everything else", () => {
    expect(parseLocalHour("0")).toBe(0);
    expect(parseLocalHour("23")).toBe(23);
    for (const bad of ["24", "-1", "abc", "1.5", "", "007", undefined, null, 5]) {
      expect(parseLocalHour(bad)).toBeNull();
    }
  });
});
