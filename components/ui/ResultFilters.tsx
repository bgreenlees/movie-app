"use client";

import { useEffect, useState } from "react";
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

function CoStarSearch({
  excludeIds,
  onPick,
}: {
  excludeIds: Set<number>;
  onPick: (person: CoStar) => void;
}) {
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
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add a co-star…"
        aria-label="Search for a co-star"
        className="w-full px-3 py-2 text-sm rounded-lg outline-none"
        style={{ border: "1px solid var(--border)", backgroundColor: "var(--background)", color: "var(--foreground)" }}
      />
      {visible.length > 0 && (
        <ul
          className="absolute z-20 left-0 right-0 mt-1 rounded-lg overflow-hidden shadow-lg"
          style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}
        >
          {visible.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  onPick({ id: p.id, name: p.name, profilePath: p.profile_path });
                  setQuery("");
                  setResults([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:opacity-80"
                style={{ color: "var(--foreground)" }}
              >
                <span className="shrink-0 rounded-full overflow-hidden" style={{ width: 28, height: 28, backgroundColor: "var(--border)" }}>
                  {p.profile_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w92${p.profile_path}`}
                      alt=""
                      width={28}
                      height={28}
                      className="object-cover w-full h-full"
                    />
                  )}
                </span>
                <span className="flex-1 truncate">{p.name}</span>
                {p.known_for_department && (
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.known_for_department === "Acting" ? "Actor" : p.known_for_department === "Directing" ? "Director" : p.known_for_department}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
  backgroundColor: active ? "var(--accent)" : "transparent",
  color: active ? "white" : "var(--foreground)",
});

export default function ResultFilters({
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
  const activeFilterCount = selectedGenreIds.length + (coStars?.length ?? 0);
  const isFiltered = activeFilterCount > 0;
  // Selected genres stay visible even if the current results no longer contain them.
  const genreChips = [
    ...genres,
    ...selectedGenreIds.filter((id) => !genres.some((g) => g.id === id)).map((id) => ({ id, name: `Genre ${id}`, count: 0 })),
  ];

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortOption)}
          aria-label="Sort results"
          className="px-3 py-2 text-sm font-medium rounded-lg cursor-pointer"
          style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} style={{ backgroundColor: "var(--card-bg)", color: "var(--foreground)" }}>
              {o.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer"
          style={chipStyle(isFiltered)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M6 12h12M10 19h4" />
          </svg>
          Filters{isFiltered ? ` (${activeFilterCount})` : ""}
        </button>

        {isFiltered && (
          <>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              {shownCount} of {totalCount}
            </span>
            <button type="button" onClick={onClear} className="text-sm underline cursor-pointer" style={{ color: "var(--accent)" }}>
              Clear
            </button>
          </>
        )}
      </div>

      {/* Active co-stars stay visible when the panel is closed */}
      {!open && supportsCoStars && coStars.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {coStars.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onRemoveCoStar(c.id)}
              className="px-3 py-1 text-xs rounded-full cursor-pointer"
              style={chipStyle(true)}
              aria-label={`Remove co-star ${c.name}`}
            >
              with {c.name} ✕
            </button>
          ))}
        </div>
      )}

      {open && (
        <div
          className="mt-3 p-4 rounded-lg space-y-4"
          style={{ border: "1px solid var(--border)", backgroundColor: "var(--card-bg)" }}
        >
          {supportsCoStars && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                Co-stars
              </h3>
              {coStars.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {coStars.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => onRemoveCoStar(c.id)}
                      className="px-3 py-1 text-xs rounded-full cursor-pointer"
                      style={chipStyle(true)}
                      aria-label={`Remove co-star ${c.name}`}
                    >
                      {c.name} ✕
                    </button>
                  ))}
                </div>
              )}
              <CoStarSearch
                excludeIds={new Set([...(coStars.map((c) => c.id)), ...(excludePersonId ? [excludePersonId] : [])])}
                onPick={onAddCoStar}
              />
            </div>
          )}

          {genreChips.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
                Genres
              </h3>
              <div className="flex flex-wrap gap-2">
                {genreChips.map((g) => {
                  const active = selectedGenreIds.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => onToggleGenre(g.id)}
                      aria-pressed={active}
                      className="px-3 py-1 text-xs rounded-full cursor-pointer"
                      style={chipStyle(active)}
                    >
                      {g.name}
                      {g.count > 0 && <span className="opacity-60"> {g.count}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
