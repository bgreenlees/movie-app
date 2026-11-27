"use client";

import PosterCard, { POSTER_GRID } from "@/components/ui/PosterCard";
import { yearMeta } from "@/lib/posterCard";

export interface PairCardTitle {
  id: number;
  mediaType: "movie" | "tv";
  title: string;
  posterPath: string | null;
  date: string | null;
  overview?: string;
}

/**
 * One title on the Watch Together page, movie or TV: a PosterCard with an
 * optional "why" line under the caption.
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
  /** Already on one of my lists: the action shows ✓ and opens Update */
  hasEntry: boolean;
  onAdd: () => void;
  onTrailer: () => void;
}) {
  return (
    <PosterCard
      id={item.id}
      mediaType={item.mediaType}
      title={item.title}
      posterPath={item.posterPath}
      overview={item.overview}
      meta={yearMeta(item.date, item.mediaType)}
      onList={hasEntry}
      onAdd={onAdd}
      onTrailer={onTrailer}
    >
      {caption && (
        <p className="mt-1 line-clamp-3 text-[13px] leading-[18px] text-text" title={caption}>
          {caption}
        </p>
      )}
    </PosterCard>
  );
}

/** The poster grid rule, kept under its old name for the Watch Together pages. */
export const PAIR_GRID = POSTER_GRID;
