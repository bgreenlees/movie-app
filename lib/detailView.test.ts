import { describe, expect, it } from "vitest";
import {
  buildProviderOptions,
  formatRating,
  formatRuntime,
  genreList,
  heroEyebrow,
  joinMeta,
  tvYearSpan,
  yearOf,
} from "./detailView";

const p = (provider_id: number, provider_name: string) => ({ provider_id, provider_name, logo_path: `/${provider_id}.png` });

describe("formatRuntime", () => {
  it("formats hours and minutes", () => {
    expect(formatRuntime(166)).toBe("2h 46m");
    expect(formatRuntime(120)).toBe("2h");
    expect(formatRuntime(45)).toBe("45m");
  });
  it("returns null for missing or zero runtimes", () => {
    expect(formatRuntime(null)).toBeNull();
    expect(formatRuntime(undefined)).toBeNull();
    expect(formatRuntime(0)).toBeNull();
    expect(formatRuntime(NaN)).toBeNull();
  });
});

describe("yearOf / tvYearSpan", () => {
  it("takes the year from an ISO date", () => {
    expect(yearOf("2024-03-01")).toBe("2024");
    expect(yearOf("")).toBeNull();
    expect(yearOf(null)).toBeNull();
    expect(yearOf("soon")).toBeNull();
  });
  it("shows an open span for running shows and a closed one for ended shows", () => {
    expect(tvYearSpan("2019-01-01", "2024-05-01", false)).toBe("2019–");
    expect(tvYearSpan("2019-01-01", "2023-05-01", true)).toBe("2019–2023");
    expect(tvYearSpan("2019-01-01", "2019-12-01", true)).toBe("2019");
    expect(tvYearSpan("2019-01-01", null, true)).toBe("2019");
    expect(tvYearSpan(null, null, true)).toBeNull();
  });
});

describe("meta helpers", () => {
  it("formats ratings and skips unrated titles", () => {
    expect(formatRating(8.234)).toBe("★ 8.2");
    expect(formatRating(0)).toBeNull();
  });
  it("joins only the non-empty parts", () => {
    expect(joinMeta(["2024", null, "2h 46m", "", false, "★ 8.2"])).toBe("2024 · 2h 46m · ★ 8.2");
    expect(joinMeta([null])).toBe("");
  });
  it("lists the first two genres", () => {
    expect(genreList([{ name: "Sci-Fi" }, { name: "Adventure" }, { name: "Drama" }])).toBe("Sci-Fi, Adventure");
    expect(genreList([])).toBeNull();
  });
});

describe("buildProviderOptions", () => {
  it("returns nothing without US providers", () => {
    expect(buildProviderOptions(undefined)).toEqual([]);
  });

  it("lists each provider once, streaming before rent/buy, merging rent + buy", () => {
    const options = buildProviderOptions({
      rent: [p(2, "Apple TV"), p(3, "Google Play")],
      buy: [p(2, "Apple TV"), p(10, "Amazon")],
      flatrate: [p(8, "Netflix")],
    });
    expect(options.map((o) => [o.name, o.kind])).toEqual([
      ["Netflix", "Stream"],
      ["Apple TV", "Rent or buy"],
      ["Google Play", "Rent"],
      ["Amazon", "Buy"],
    ]);
    expect(options.every((o) => !o.yours)).toBe(true);
  });

  it("puts the user's services first", () => {
    const options = buildProviderOptions(
      { flatrate: [p(8, "Netflix"), p(1899, "Max")], rent: [p(2, "Apple TV")] },
      [1899, 2]
    );
    expect(options.map((o) => [o.name, o.yours])).toEqual([
      ["Max", true],
      ["Apple TV", true],
      ["Netflix", false],
    ]);
  });

  it("matches saved services on the canonical ID (retired IDs and tiers)", () => {
    // 2616 is a Paramount+ tier and 531 a retired Paramount+ ID; both map to 2303.
    const options = buildProviderOptions({ flatrate: [p(8, "Netflix"), p(2616, "Paramount+")] }, [531]);
    expect(options[0]).toMatchObject({ id: 2303, name: "Paramount+", yours: true });
  });
});

describe("heroEyebrow", () => {
  it("names the user's streaming service, else the first streaming one", () => {
    const options = buildProviderOptions({ flatrate: [p(8, "Netflix"), p(1899, "Max")] }, [1899]);
    expect(heroEyebrow("movie", options)).toBe("Movie · On Max");
    expect(heroEyebrow("tv", buildProviderOptions({ flatrate: [p(8, "Netflix")] }))).toBe("TV series · On Netflix");
  });
  it("prefers a direct service over an add-on channel", () => {
    const options = buildProviderOptions({ flatrate: [p(1825, "HBO Max Amazon Channel"), p(1899, "HBO Max")] });
    expect(heroEyebrow("movie", options)).toBe("Movie · On HBO Max");
  });
  it("omits the service when nothing streams", () => {
    expect(heroEyebrow("movie", buildProviderOptions({ rent: [p(2, "Apple TV")] }))).toBe("Movie");
  });
});
