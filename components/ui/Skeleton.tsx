import { POSTER_GRID_CLASS } from "@/lib/posterGrid";

/** Shimmer block. Pair with a fixed size or aspect ratio so the layout doesn't jump when content arrives. */
export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-card bg-surface-2 ${className}`} />;
}

/** One poster-shaped placeholder: 2:3 image plus title and meta lines, matching PosterCard's footprint. */
export function PosterSkeleton() {
  return (
    <div aria-hidden="true" className="flex min-w-0 flex-col gap-2.5">
      <SkeletonBlock className="aspect-[2/3] w-full" />
      <div className="flex flex-col gap-1.5">
        <SkeletonBlock className="h-4 w-3/4 !rounded-chip" />
        <SkeletonBlock className="h-3.5 w-1/3 !rounded-chip" />
      </div>
    </div>
  );
}

/** Placeholder posters laid out in the real shared grid. Announces itself once to screen readers. */
export default function Skeleton({ count = 12, label = "Loading" }: { count?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}…</span>
      <div className={POSTER_GRID_CLASS}>
        {Array.from({ length: count }, (_, i) => (
          <PosterSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
