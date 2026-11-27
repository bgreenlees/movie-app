"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import toast from "react-hot-toast";
import { Logo, LogoMark } from "@/components/brand/Logo";
import FeedbackModal from "@/components/ui/FeedbackModal";
import { NAV_LINKS, isActivePath } from "@/lib/navLinks";

interface MultiTitle {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  release_date?: string;
  first_air_date?: string;
  media_type: "movie" | "tv";
}

interface MultiPerson {
  id: number;
  name: string;
  profile_path: string | null;
  known_for_department: string | null;
}

interface MultiGenre {
  id: number;
  name: string;
  media: "movie" | "tv";
}

interface MultiSuggestions {
  movies: MultiTitle[];
  tvShows: MultiTitle[];
  people: MultiPerson[];
  genres: MultiGenre[];
}

const EMPTY_SUGGESTIONS: MultiSuggestions = { movies: [], tvShows: [], people: [], genres: [] };

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<MultiSuggestions>(EMPTY_SUGGESTIONS);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const profileRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);

  // Close the search sheet and hand focus back to the button that opened it,
  // so keyboard and screen-reader users don't land on <body>.
  const closeSearch = useCallback(() => {
    setShowSearch(false);
    searchButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    // The theme lives on <html> (set by an inline script before hydration), so it
    // can only be read after mount; syncing it here avoids a hydration mismatch.
    // No saved choice means the OS setting decides (prefers-color-scheme in globals.css).
    const effective =
      current === "light" || current === "dark"
        ? current
        : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(effective);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!showSearch) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSearch();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSearch, closeSearch]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    setTheme(next);
  };

  const handleSignOut = async () => {
    setShowProfileMenu(false);
    await signOut({ redirect: true, callbackUrl: "/login" });
    toast.success("Logged out successfully");
  };

  // Clear suggestions in the event handler rather than in the effect below,
  // so a short query doesn't trigger an extra render pass.
  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setSuggestions(EMPTY_SUGGESTIONS);
      setShowSuggestions(false);
    }
  };

  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search/multi?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions({
            movies: data.movies || [],
            tvShows: data.tvShows || [],
            people: data.people || [],
            genres: data.genres || [],
          });
          setShowSuggestions(true);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const hasSuggestions =
    suggestions.movies.length +
      suggestions.tvShows.length +
      suggestions.people.length +
      suggestions.genres.length >
    0;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    closeSearch();
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleTitle = (title: MultiTitle) => {
    const label = title.title || title.name || "";
    setQuery(label);
    setShowSuggestions(false);
    closeSearch();
    router.push(`/search?q=${encodeURIComponent(label)}`);
  };

  const handlePerson = (person: MultiPerson) => {
    setQuery(person.name);
    setShowSuggestions(false);
    closeSearch();
    router.push(`/search?personId=${person.id}&name=${encodeURIComponent(person.name)}`);
  };

  const handleGenre = (genre: MultiGenre) => {
    setQuery(genre.name);
    setShowSuggestions(false);
    closeSearch();
    router.push(
      `/search?genreId=${genre.id}&genreName=${encodeURIComponent(genre.name)}&genreMedia=${genre.media}`
    );
  };

  const renderSuggestions = (variant: "desktop" | "mobile") => {
    if (!hasSuggestions) return null;
    const rowPad = variant === "desktop" ? "px-3 py-2" : "px-4 py-2.5";
    const headerPad = variant === "desktop" ? "px-3 pt-2 pb-1" : "px-4 pt-2.5 pb-1";
    return (
      <div className="absolute z-50 w-full mt-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-md shadow-lg max-h-96 overflow-y-auto">
        {(suggestions.movies.length > 0 || suggestions.tvShows.length > 0) && (
          <>
            <p
              className={`${headerPad} text-[10px] font-semibold uppercase tracking-wider`}
              style={{ color: "var(--text-muted)" }}
            >
              Titles
            </p>
            {suggestions.movies.map((m) => (
              <button
                key={`m-${m.id}`}
                type="button"
                onClick={() => handleTitle(m)}
                className={`w-full ${rowPad} text-left hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2`}
              >
                <span className="text-sm font-medium truncate" style={{ color: "var(--primary)" }}>
                  {m.title}
                </span>
                {m.release_date && (
                  <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    ({new Date(m.release_date).getFullYear()})
                  </span>
                )}
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider shrink-0 ml-auto px-1.5 py-0.5 rounded"
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  Movie
                </span>
              </button>
            ))}
            {suggestions.tvShows.map((s) => (
              <button
                key={`t-${s.id}`}
                type="button"
                onClick={() => handleTitle(s)}
                className={`w-full ${rowPad} text-left hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2`}
              >
                <span className="text-sm font-medium truncate" style={{ color: "var(--primary)" }}>
                  {s.name}
                </span>
                {s.first_air_date && (
                  <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    ({new Date(s.first_air_date).getFullYear()})
                  </span>
                )}
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider shrink-0 ml-auto px-1.5 py-0.5 rounded"
                  style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
                >
                  TV
                </span>
              </button>
            ))}
          </>
        )}

        {suggestions.people.length > 0 && (
          <>
            <p
              className={`${headerPad} text-[10px] font-semibold uppercase tracking-wider`}
              style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}
            >
              People
            </p>
            {suggestions.people.map((p) => (
              <button
                key={`p-${p.id}`}
                type="button"
                onClick={() => handlePerson(p)}
                className={`w-full ${rowPad} text-left hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2`}
              >
                <div
                  className="shrink-0 rounded-full overflow-hidden"
                  style={{ width: 24, height: 24, backgroundColor: "var(--border)" }}
                >
                  {p.profile_path && (
                    <Image
                      src={`https://image.tmdb.org/t/p/w45${p.profile_path}`}
                      alt={p.name}
                      width={24}
                      height={24}
                      className="object-cover w-full h-full"
                    />
                  )}
                </div>
                <span className="text-sm font-medium truncate" style={{ color: "var(--primary)" }}>
                  {p.name}
                </span>
                {p.known_for_department && (
                  <span className="text-xs shrink-0 ml-auto" style={{ color: "var(--text-muted)" }}>
                    {p.known_for_department === "Directing" ? "Director" : p.known_for_department === "Acting" ? "Actor" : p.known_for_department}
                  </span>
                )}
              </button>
            ))}
          </>
        )}

        {suggestions.genres.length > 0 && (
          <>
            <p
              className={`${headerPad} text-[10px] font-semibold uppercase tracking-wider`}
              style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border)" }}
            >
              Genres
            </p>
            <div className={`${rowPad} flex flex-wrap gap-1.5`}>
              {suggestions.genres.map((g) => (
                <button
                  key={`g-${g.media}-${g.id}`}
                  type="button"
                  onClick={() => handleGenre(g)}
                  className="px-2.5 py-1 rounded-full text-xs transition-colors hover:opacity-80"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--accent) 12%, var(--card-bg))",
                    color: "var(--color-accent-text)",
                    border: "1px solid var(--accent)",
                  }}
                >
                  {g.name}
                  <span className="ml-1 opacity-70">· {g.media === "movie" ? "movies" : "TV"}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card-bg)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">

        {/* Top row: Logo | desktop nav | icons */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Logo */}
          <Link href="/search" className="flex shrink-0 items-center" aria-label="What's Up Next: Discover">
            <Logo variant="horizontal" size={22} cropped className="max-sm:hidden" />
            <LogoMark size={24} decorative cropped className="block sm:hidden" />
          </Link>

          {/* Desktop nav links */}
          <div className="hidden lg:flex gap-0.5 xl:gap-1 min-w-0 items-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
                className={`transition-all px-2.5 xl:px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${isActivePath(pathname, link.href) ? "font-semibold" : ""}`}
                style={{
                  color: isActivePath(pathname, link.href) ? "white" : "var(--foreground)",
                  backgroundColor: isActivePath(pathname, link.href) ? "var(--accent)" : "transparent",
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Right side: desktop search + icons */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">

            {/* Inline search from xl up; below that the search icon opens the sheet */}
            <div className="hidden xl:block relative w-64">
              <form onSubmit={handleSearch}>
                <div className="flex">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => { if (hasSuggestions) setShowSuggestions(true); }}
                    onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                    placeholder="Search titles, people, genres..."
                    className="w-full px-3 py-1.5 text-sm border rounded-l-md bg-[var(--card-bg)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-white text-sm rounded-r-md shrink-0"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </form>
              {showSuggestions && renderSuggestions("desktop")}
            </div>

            <button
              ref={searchButtonRef}
              onClick={() => setShowSearch(true)}
              className="xl:hidden p-2 rounded-full transition-colors hover:bg-[var(--hover-bg)] shrink-0"
              style={{ color: "var(--foreground)" }}
              aria-label="Search"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            {/* Feedback icon */}
            <button
              onClick={() => setShowFeedback(true)}
              className="p-2 rounded-full transition-colors hover:bg-[var(--hover-bg)] shrink-0"
              style={{ color: "var(--foreground)" }}
              aria-label="Suggest a feature"
              title="Suggest a feature"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m1.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>

            {/* Profile icon + dropdown */}
            <div className="relative shrink-0" ref={profileRef}>
              <button
                onClick={() => setShowProfileMenu((prev) => !prev)}
                className="p-2 rounded-full transition-colors hover:bg-[var(--hover-bg)]"
                style={{ color: "var(--foreground)" }}
                aria-label="Profile menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A9 9 0 0112 15a9 9 0 016.879 2.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>

              {showProfileMenu && (
                <div
                  className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-2xl overflow-hidden z-50"
                  style={{ backgroundColor: "var(--card-bg)", border: "1px solid var(--border)" }}
                >
                  <Link
                    href="/profile"
                    onClick={() => setShowProfileMenu(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--foreground)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A9 9 0 0112 15a9 9 0 016.879 2.804M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Profile
                  </Link>

                  <Link
                    href="/news"
                    onClick={() => setShowProfileMenu(false)}
                    className="lg:hidden flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--foreground)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                    </svg>
                    News
                  </Link>

                  <div style={{ borderTop: "1px solid var(--border)" }} />

                  <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm transition-colors hover:bg-[var(--hover-bg)]"
                    style={{ color: "var(--foreground)" }}
                  >
                    <div className="flex items-center gap-3">
                      {theme === "dark" ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                      )}
                      <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                    </div>
                    <div
                      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                      style={{ backgroundColor: theme === "dark" ? "var(--accent)" : "var(--border)" }}
                    >
                      <div
                        className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
                        style={{ transform: theme === "dark" ? "translateX(18px)" : "translateX(2px)" }}
                      />
                    </div>
                  </button>

                  <div style={{ borderTop: "1px solid var(--border)" }} />

                  <button
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--hover-bg)] text-left"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Search sheet: opened by the search icon below xl */}
      {showSearch && (
        <div className="fixed inset-0 z-50 xl:hidden" role="dialog" aria-modal="true" aria-label="Search">
          <div className="absolute inset-0 bg-black/50" onClick={() => closeSearch()} />
          <div className="relative bg-[var(--card-bg)] border-b border-[var(--border)] px-4 sm:px-6 py-3 shadow-lg">
            <div className="max-w-2xl mx-auto relative">
              <form onSubmit={handleSearch} className="flex gap-2 items-center">
                <div className="flex flex-1 min-w-0">
                  <input
                    type="text"
                    autoFocus
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onFocus={() => { if (hasSuggestions) setShowSuggestions(true); }}
                    placeholder="Search titles, people, genres..."
                    aria-label="Search titles, people, genres"
                    className="w-full min-w-0 px-4 py-3 text-base border rounded-l-md bg-[var(--card-bg)]"
                    style={{ borderColor: "var(--border)", color: "var(--foreground)" }}
                  />
                  <button
                    type="submit"
                    aria-label="Search"
                    className="px-4 py-3 text-white rounded-r-md shrink-0"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => closeSearch()}
                  className="px-2 py-3 text-sm shrink-0"
                  style={{ color: "var(--foreground)" }}
                >
                  Cancel
                </button>
              </form>
              {showSuggestions && renderSuggestions("mobile")}
            </div>
          </div>
        </div>
      )}
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
    </nav>
  );
}
