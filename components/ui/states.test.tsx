import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";
import ErrorState from "./ErrorState";
import { POSTER_GRID_CLASS } from "../../lib/posterGrid";

describe("Skeleton", () => {
  it("renders the requested number of poster placeholders in the shared grid", () => {
    const html = renderToStaticMarkup(<Skeleton count={5} label="Loading movies" />);
    expect(html).toContain(POSTER_GRID_CLASS);
    expect(html.match(/aspect-\[2\/3\]/g)).toHaveLength(5);
  });

  it("announces itself once, as a polite busy status", () => {
    const html = renderToStaticMarkup(<Skeleton label="Loading movies" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading movies…");
  });
});

describe("shared poster grid", () => {
  it("is 3 columns on phones (2 under 360px), then auto-fill ~150px columns", () => {
    expect(POSTER_GRID_CLASS).toContain("grid-cols-2");
    expect(POSTER_GRID_CLASS).toContain("min-[360px]:grid-cols-3");
    expect(POSTER_GRID_CLASS).toContain("repeat(auto-fill,minmax(150px,1fr))");
  });
});

describe("EmptyState", () => {
  it("shows title, body and a link action", () => {
    const html = renderToStaticMarkup(
      <EmptyState icon="🎬" title="Your watchlist is empty" body="Find something." action={{ label: "Browse Discover", href: "/search" }} />
    );
    expect(html).toContain("Your watchlist is empty");
    expect(html).toContain("Find something.");
    expect(html).toContain('href="/search"');
    expect(html).toContain("Browse Discover");
  });

  it("omits the action and body when not given, and hides the icon from screen readers", () => {
    const html = renderToStaticMarkup(<EmptyState icon="🎬" title="Nothing" />);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("<button");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("ErrorState", () => {
  it("is an alert with a Retry button only when a retry handler is given", () => {
    const withRetry = renderToStaticMarkup(<ErrorState onRetry={() => {}} />);
    expect(withRetry).toContain('role="alert"');
    expect(withRetry).toContain("Retry");
    expect(renderToStaticMarkup(<ErrorState />)).not.toContain("Retry");
  });
});
