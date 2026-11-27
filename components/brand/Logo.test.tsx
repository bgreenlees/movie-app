import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Logo, LogoMark } from "./Logo";

describe("Logo", () => {
  it("renders the exact reference geometry and colours", () => {
    const html = renderToStaticMarkup(<LogoMark />);
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain('cx="25.6" cy="32" r="16" fill="#7C3AED"');
    expect(html).toContain('cx="38.4" cy="32" r="16" fill="#FB7185"');
    expect(html).toContain('d="M32 17.34A16 16 0 0 1 32 46.66A16 16 0 0 1 32 17.34Z" fill="#FBBF24"');
  });

  it("has an accessible name", () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-label="What&#x27;s Up Next"');
    expect(renderToStaticMarkup(<Logo />)).toContain('aria-label="What&#x27;s Up Next"');
  });

  it("mono is a single evenodd path with no brand colours", () => {
    const html = renderToStaticMarkup(<LogoMark mono />);
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).not.toContain("#7C3AED");
  });
});
