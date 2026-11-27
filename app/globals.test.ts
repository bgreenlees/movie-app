import { readFileSync } from "node:fs";
import { join } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { describe, expect, it } from "vitest";

// Compiles app/globals.css with the project's Tailwind, the way Next does, so these
// tests check the CSS the browser actually gets rather than the source.
async function compile(classes: string): Promise<string> {
  const root = join(__dirname, "..");
  const from = join(__dirname, "globals.css");
  const source = readFileSync(from, "utf8") + `\n@source inline("${classes}");`;
  const result = await postcss([tailwind({ base: root })]).process(source, { from });
  return result.css;
}

/** The declarations inside the first `selector {` block. */
function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

describe("compiled design tokens", () => {
  // Tailwind copies --shadow-* values into the utility at build time, so a
  // light-theme override of --shadow-card never reached .shadow-card (PR #101 review).
  it("shadow utilities read their value at runtime, so they follow the theme", async () => {
    const css = await compile("shadow-card shadow-pop");
    expect(rule(css, ".shadow-card")).toContain("box-shadow: var(--elevation-card)");
    expect(rule(css, ".shadow-pop")).toContain("box-shadow: var(--elevation-pop)");
    for (const selector of ['[data-theme="light"]', ':root:not([data-theme="dark"])']) {
      expect(rule(css, selector)).toContain("--elevation-card: 0 0 0 1px var(--color-border)");
    }
  }, 30_000);

  it("colour utilities read the theme variable instead of a baked-in value", async () => {
    const css = await compile("bg-surface text-muted");
    expect(rule(css, ".bg-surface")).toContain("var(--color-surface)");
    expect(rule(css, ".text-muted")).toContain("var(--color-muted)");
  }, 30_000);
});
