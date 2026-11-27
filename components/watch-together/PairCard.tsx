"use client";

import MovieCard from "@/components/movies/MovieCard";
import TVShowCard from "@/components/tv/TVShowCard";

export interface PairCardTitle {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  date: string | null;
  overview?: string;
}

/**
 * One title on the Watch Together page, movie or TV. Uses the existing
 * MovieCard / TVShowCard (PosterCard v2 hasn't merged yet), with the title and
 * a meta line under the poster so posterless titles still read.
 */
export default function PairCard({
  item,
  caption,
  hasEntry,
  onAdd,
  onTrailer,
}: {
  item: PairCardTitle;
  /** One "why" line, e.g. "On both your lists" */
  caption?: string;
  /** Already on one of my lists: the button says Update */
  hasEntry: boolean;
  onAdd: () => void;
  onTrailer: () => void;
}) {
  const year = item.date?.slice(0, 4);
  const meta = [year, item.mediaType === "movie" ? "Movie" : "TV"].filter(Boolean).join(" · ");
  const body = (
    <>
      <div className="min-w-0">
        <h3 className="text-sm font-bold leading-tight truncate" style={{ color: "var(--foreground)" }} title={item.title}>
          {item.title}
        </h3>
        <p className="text-xs leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
          {meta}
        </p>
        {caption && (
          <p className="text-xs leading-snug mt-1.5 line-clamp-3" title={caption} style={{ color: "var(--foreground)" }}>
            {caption}
          </p>
        )}
      </div>
      <button
        onClick={onAdd}
        className="w-full min-h-9 px-2 py-1.5 text-white rounded-md transition-opacity duration-150 text-xs cursor-pointer hover:opacity-90"
        style={{ backgroundColor: "var(--accent)" }}
        aria-label={`${hasEntry ? "Update" : "Add"} ${item.title}`}
      >
        {hasEntry ? "Update" : "Add"}
      </button>
    </>
  );

  return item.mediaType === "movie" ? (
    <MovieCard
      id={item.id}
      title={item.title}
      posterPath={item.posterPath}
      releaseDate={item.date ?? undefined}
      overview={item.overview}
      onPlayTrailer={onTrailer}
    >
      {body}
    </MovieCard>
  ) : (
    <TVShowCard
      id={item.id}
      name={item.title}
      posterPath={item.posterPath}
      firstAirDate={item.date ?? undefined}
      overview={item.overview}
    >
      {body}
    </TVShowCard>
  );
}

/**
 * The one grid rule for this page (design review, "Grid"): 3 columns on
 * phones (2 under 360px), then as many ~150px columns as fit.
 */
export const PAIR_GRID =
  "grid grid-cols-2 min-[360px]:grid-cols-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:gap-4";
