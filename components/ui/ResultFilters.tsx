"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { SORT_OPTIONS, type SortOption } from "@/lib/resultFilters";

export interface CoStar {
  id: number;
  name: string;
  profilePath: string | null;
}

interface PersonSuggestion {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string | null;
}

interface ResultFiltersProps {
  /** Rendered at the left of the toolbar (the Movies / TV toggle). */
  leading?: ReactNode;
  /** Hide the filter button (while loading, or when there are no results). */
  disabled?: boolean;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  genres: Array<{ id: number; name: string; count: number }>;
  selectedGenreIds: number[];
  onToggleGenre: (id: number) => void;
  /** Co-star filter is only offered when these are passed (person pages). */
  coStars?: CoStar[];
  excludePersonId?: number;
  onAddCoStar?: (person: CoStar) => void;
  onRemoveCoStar?: (id: number) => void;
  shownCount: number;
  totalCount: number;
  onClear: () => void;
}

const departmentLabel = (d: string | null) =>
  d === "Acting" ? "Actor" : d === "Directing" ? "Director" : d;

function CoStarSearch({ excludeIds, onPick }: { excludeIds: Set<number>; onPick: (person: CoStar) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PersonSuggestion[]>([]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/multi?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!cancelled) setResults(data.people || []);
      } catch {}
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const visible = query.trim().length >= 2 ? results.filter((p) => !excludeIds.has(p.id)) : [];

  return (
    <div>
      <div className="relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ color: "var(--text-muted)" }}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an actor…"
          aria-label="Search for a co-star"
          className="w-full pl-9 pr-3 py-2.5 text-base sm:text-sm rounded-lg"
          style={{ border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
        />
      </div>
      {visible.length > 0 && (
        <ul className="mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: p.id, name: p.name, profilePath: p.profile_path });
                  setQuery("");
                  setResults([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm cursor-pointer hover:opacity-80"
                style={{ color: "var(--foreground)" }}
              >
                <span className="shrink-0 rounded-full overflow-hidden" style={{ width: 32, height: 32, backgroundColor: "var(--border)" }}>
                  {p.profile_path && (
                    <Image src={`https://image.tmdb.org/t/p/w92${p.profile_path}`} alt="" width={32} height={32} className="object-cover w-full h-full" />
                  )}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.known_for_department && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {departmentLabel(p.known_for_department)}
                  </span>
                )}
                <span className="text-lg leading-none" style={{ color: "var(--color-accent-text)" }} aria-hidden="true">+</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const pillStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  backgroundColor: active ? "var(--accent)" : "transparent",
  color: active ? "white" : "var(--foreground)",
});

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide mb-2.5" style={{ color: "var(--text-muted)" }}>
      {children}
    </h3>
  );
}

function RemovableChip({ label, onRemove, ariaLabel }: { label: ReactNode; onRemove: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={ariaLabel}
      className="shrink-0 inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-xs font-medium rounded-full cursor-pointer whitespace-nowrap"
      style={{
        border: "1px solid var(--accent)",
        backgroundColor: "color-mix(in srgb, var(--accent) 18%, transparent)",
        color: "var(--foreground)",
      }}
    >
      {label}
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

export default function ResultFilters({
  leading,
  disabled = false,
  sort,
  onSortChange,
  genres,
  selectedGenreIds,
  onToggleGenre,
  coStars,
  excludePersonId,
  onAddCoStar,
  onRemoveCoStar,
  shownCount,
  totalCount,
  onClear,
}: ResultFiltersProps) {
  const [open, setOpen] = useState(false);
  const supportsCoStars = !!coStars && !!onAddCoStar && !!onRemoveCoStar;
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sort)?.label ?? "";
  const isSorted = sort !== "relevance";
  const narrowingCount = selectedGenreIds.length + (coStars?.length ?? 0);
  const badgeCount = narrowingCount + (isSorted ? 1 : 0);
  const genreName = (id: number) => genres.find((g) => g.id === id)?.name ?? "Genre";

  // Sheet: close on Escape, and stop the page scrolling behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const clearAll = () => {
    onClear();
    onSortChange("relevance");
  };

  return (
    <div className="mb-5">
      {/* Toolbar: media toggle on the left, sort & filter on the right */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">{leading}</div>
        {!disabled && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-label={badgeCount ? `Sort and filter, ${badgeCount} active` : "Sort and filter"}
            className="relative shrink-0 inline-flex items-center gap-2 h-10 px-3.5 text-sm font-medium rounded-lg cursor-pointer transition-colors"
            style={pillStyle(badgeCount > 0)}
          >
            {/* Sliders icon */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
              <circle cx="15" cy="6" r="2" strokeWidth={1.8} />
              <circle cx="9" cy="12" r="2" strokeWidth={1.8} />
              <circle cx="17" cy="18" r="2" strokeWidth={1.8} />
            </svg>
            <span className="sm:hidden">Filter</span>
            <span className="hidden sm:inline">Sort &amp; filter</span>
            {badgeCount > 0 && (
              <span
                className="inline-flex items-center justify-center min-w-5 h-5 px-1 text-xs font-bold rounded-full"
                style={{ backgroundColor: "white", color: "var(--accent)" }}
              >
                {badgeCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Active filters as removable chips (scrolls sideways on narrow screens) */}
      {!disabled && badgeCount > 0 && (
        <div className="flex items-center gap-2 mt-3 overflow-x-auto py-1 pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap [scrollbar-width:none]">
          {narrowingCount > 0 && (
            <span className="shrink-0 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              {shownCount} of {totalCount}
            </span>
          )}
          {isSorted && (
            <RemovableChip label={sortLabel} ariaLabel={`Reset sort (${sortLabel})`} onRemove={() => onSortChange("relevance")} />
          )}
          {supportsCoStars &&
            coStars.map((c) => (
              <RemovableChip key={`c${c.id}`} label={`with ${c.name}`} ariaLabel={`Remove co-star ${c.name}`} onRemove={() => onRemoveCoStar(c.id)} />
            ))}
          {selectedGenreIds.map((id) => (
            <RemovableChip key={`g${id}`} label={genreName(id)} ariaLabel={`Remove genre ${genreName(id)}`} onRemove={() => onToggleGenre(id)} />
          ))}
          {badgeCount > 1 && (
            <button type="button" onClick={clearAll} className="shrink-0 text-xs font-medium px-1 cursor-pointer whitespace-nowrap" style={{ color: "var(--color-accent-text)" }}>
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Sheet: slides up from the bottom on phones, centred panel on larger screens */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true" aria-label="Sort and filter">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div
            className="relative w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl shadow-2xl"
            style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
          >
            {/* Grab handle (phones) */}
            <div className="sm:hidden flex justify-center pt-2.5">
              <span className="h-1 w-10 rounded-full" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <div className="flex items-center justify-between px-5 pt-3 pb-3 sm:pt-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
                Sort &amp; filter
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="h-9 w-9 -mr-2 inline-flex items-center justify-center rounded-full cursor-pointer"
                style={{ color: "var(--text-muted)" }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6">
              <section>
                <SectionTitle>Sort by</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  {SORT_OPTIONS.map((o) => {
                    const active = sort === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => onSortChange(o.value)}
                        aria-pressed={active}
                        className="px-3 py-2.5 text-sm rounded-lg cursor-pointer text-left"
                        style={pillStyle(active)}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {supportsCoStars && (
                <section>
                  <SectionTitle>Also starring</SectionTitle>
                  {coStars.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2.5">
                      {coStars.map((c) => (
                        <RemovableChip key={c.id} label={c.name} ariaLabel={`Remove co-star ${c.name}`} onRemove={() => onRemoveCoStar(c.id)} />
                      ))}
                    </div>
                  )}
                  <CoStarSearch
                    excludeIds={new Set([...coStars.map((c) => c.id), ...(excludePersonId ? [excludePersonId] : [])])}
                    onPick={onAddCoStar}
                  />
                </section>
              )}

              {genres.length > 0 && (
                <section>
                  <SectionTitle>Genres</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {genres.map((g) => {
                      const active = selectedGenreIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => onToggleGenre(g.id)}
                          aria-pressed={active}
                          className="px-3 py-1.5 text-sm rounded-full cursor-pointer"
                          style={pillStyle(active)}
                        >
                          {g.name}
                          <span className="ml-1 opacity-60">{g.count}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            <div
              className="flex items-center gap-3 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                type="button"
                onClick={clearAll}
                disabled={badgeCount === 0}
                className="px-4 py-3 text-sm font-medium rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-default"
                style={{ color: "var(--foreground)" }}
              >
                Clear all
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-3 text-sm font-semibold text-white rounded-lg cursor-pointer hover:opacity-90"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {shownCount === 0 ? "No results" : `Show ${shownCount} ${shownCount === 1 ? "result" : "results"}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
