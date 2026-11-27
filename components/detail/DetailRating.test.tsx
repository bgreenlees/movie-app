import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Vitest has no "@/" alias, so map the component's imports by hand.
vi.mock("@/lib/detailRating", () => import("../../lib/detailRating"));
vi.mock("react-hot-toast", () => ({ default: { error: () => {} } }));

import DetailRating from "./DetailRating";

const noop = async () => {};

describe("DetailRating", () => {
  it("offers the three thumb ratings, none pressed when unrated", () => {
    const html = renderToStaticMarkup(<DetailRating title="Dune" rating={null} onRate={noop} />);
    for (const label of ["Didn&#x27;t like", "Like", "Love"]) expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="Your rating for Dune"');
  });

  it("marks the saved rating as pressed", () => {
    const html = renderToStaticMarkup(<DetailRating title="Dune" rating={3} onRate={noop} />);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Love"|aria-label="Love"[^>]*aria-pressed="true"/);
  });
});
