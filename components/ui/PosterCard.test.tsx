import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Vitest has no "@/" alias, so map the component's imports by hand. The detail
// modals fetch on open and are never open in a static render.
vi.mock("@/lib/posterCard", () => import("../../lib/posterCard"));
vi.mock("@/lib/tmdbImages", () => import("../../lib/tmdbImages"));
vi.mock("@/components/movies/MovieDetailModal", () => ({ default: () => null }));
vi.mock("@/components/tv/TVShowDetailModal", () => ({ default: () => null }));

import PosterCard from "./PosterCard";

const noop = () => {};

describe("PosterCard", () => {
  it("links the whole poster to the detail page", () => {
    const html = renderToStaticMarkup(
      <PosterCard id={693134} mediaType="movie" title="Dune: Part Two" posterPath={null} meta="2024 · Movie" onAdd={noop} />
    );
    expect(html).toContain('href="/movie/693134"');
    expect(html).toContain('aria-label="Dune: Part Two: details"');
    expect(html).toContain("2024 · Movie");
  });

  it("has one + action, which becomes ✓ when on a list", () => {
    const add = renderToStaticMarkup(
      <PosterCard id={1} mediaType="tv" title="Severance" posterPath={null} onAdd={noop} />
    );
    expect(add).toContain('aria-label="Add Severance to a list"');
    const added = renderToStaticMarkup(
      <PosterCard id={1} mediaType="tv" title="Severance" posterPath={null} onList onAdd={noop} />
    );
    expect(added).toContain('aria-label="On your list: Severance. Update"');
    expect(added).toContain('href="/tv/1"');
  });

  it("shows the ⋯ menu button only when there is something in it", () => {
    const bare = renderToStaticMarkup(<PosterCard id={1} mediaType="movie" title="X" posterPath={null} onAdd={noop} />);
    expect(bare).not.toContain("More for X");
    const rated = renderToStaticMarkup(
      <PosterCard id={1} mediaType="movie" title="X" posterPath={null} onAdd={noop} onRate={noop} />
    );
    expect(rated).toContain('aria-label="More for X"');
    expect(rated).toContain('aria-expanded="false"');
  });

  it("renders the status chip and the progress bar when given", () => {
    const html = renderToStaticMarkup(
      <PosterCard
        id={1}
        mediaType="tv"
        title="The Bear"
        posterPath={null}
        meta="S3 · E2"
        statusChip="Watching"
        progress={0.3}
        onList
        onAdd={noop}
      />
    );
    expect(html).toContain(">Watching<");
    expect(html).toContain('aria-label="30% of season watched"');
    expect(html).toContain("width:30%");
  });
});
