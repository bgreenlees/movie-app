import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contrastRatio, readColorTokens } from "./contrast";

describe("contrastRatio", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The old muted grey on black failed AA (design review finding #6).
    expect(contrastRatio("#6e6e73", "#000000")).toBeLessThan(4.5);
  });
});

// Guards the "Cinema dark" tokens: a palette tweak can't quietly break AA contrast.
describe("design tokens in app/globals.css", () => {
  const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
  const block = (selector: string) => {
    const start = css.indexOf(selector);
    expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
    return css.slice(start, css.indexOf("}", start));
  };
  const themes = {
    dark: readColorTokens(block("@theme static {")),
    light: readColorTokens(block('[data-theme="light"] {')),
    "light (OS setting)": readColorTokens(block(':root:not([data-theme="dark"]) {')),
    "force-dark": readColorTokens(block(".force-dark {\n  color-scheme: dark;")),
  };

  it("defines the same colour tokens in every palette block", () => {
    const names = Object.keys(themes.dark).sort();
    expect(names.length).toBeGreaterThan(10);
    for (const tokens of Object.values(themes)) expect(Object.keys(tokens).sort()).toEqual(names);
  });

  it("keeps the OS-setting light palette identical to the explicit light theme", () => {
    expect(themes["light (OS setting)"]).toEqual(themes.light);
    expect(themes["force-dark"]).toEqual(themes.dark);
  });

  for (const [theme, t] of Object.entries(themes)) {
    describe(theme, () => {
      for (const surface of ["bg", "surface", "surface-2"]) {
        for (const fg of ["text", "muted", "accent-text", "success", "warning", "danger"]) {
          it(`${fg} on ${surface} is at least 4.5:1`, () => {
            expect(contrastRatio(t[fg], t[surface])).toBeGreaterThanOrEqual(4.5);
          });
        }
      }
      it("white on accent and accent-hover is at least 4.5:1", () => {
        expect(contrastRatio("#ffffff", t.accent)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio("#ffffff", t["accent-hover"])).toBeGreaterThanOrEqual(4.5);
      });
      it("focus ring is at least 3:1 on bg (non-text contrast)", () => {
        expect(contrastRatio(t.focus, t.bg)).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
