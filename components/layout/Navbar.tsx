"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import type { TMDBMovie } from "@/lib/tmdb";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme") as "light" | "dark";
    setTheme(current || "dark");
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/movies/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setSuggestions(
            (data.results || [])
              .sort((a: TMDBMovie, b: TMDBMovie) => b.popularity - a.popularity)
              .slice(0, 5)
          );
          setShowSuggestions(true);
        }
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  const handleSuggestion = (movie: TMDBMovie) => {
    setQuery(movie.title);
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(movie.title)}`);
  };

  const navLinks = [
    { href: "/search", label: "Discover" },
    { href: "/new-releases", label: "New Releases" },
    { href: "/news", label: "News" },
    { href: "/watchlist", label: "My Movies" },
    { href: "/tv/watching", label: "My TV" },
  ];

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card-bg)]">
      <div className="max-w-7xl mx-auto px-6 py-3">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <Link href="/search" className="text-xl font-bold shrink-0" style={{ color: "var(--primary)" }}>
            Movie Watchlist
          </Link>

          {/* Nav links */}
          <div className="hidden md:flex gap-1 shrink-0 items-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`transition-all px-3 py-1.5 rounded-md text-sm ${pathname === link.href ? "font-semibold" : ""}`}
                style={{
                  color: pathname === link.href ? "white" : "var(--foreground)",
                  backgroundColor: pathname === link.href ? "var(--accent)" : "transparent",
                }}
              >
                {link.label}
              </Link>
            ))}

          </div>

          {/* Search bar + profile grouped right */}
          <div className="ml-auto flex items-center gap-2">
          <div className="relative w-64">
            <form onSubmit={handleSearch}>
              <div className="flex">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Search movies..."
                  className="w-full px-3 py-1.5 text-sm border rounded-l-md focus:outline-none focus:ring-1 focus:ring-[var(--accent)] bg-[var(--card-bg)]"
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
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-[var(--card-bg)] border border-[var(--border)] rounded-md shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((movie) => (
                  <button
                    key={movie.id}
                    type="button"
                    onClick={() => handleSuggestion(movie)}
                    className="w-full px-3 py-2 text-left hover:bg-[var(--hover-bg)] transition-colors flex items-center gap-2"
                  >
                    <span className="text-sm font-medium" style={{ color: "var(--primary)" }}>{movie.title}</span>
                    {movie.release_date && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        ({new Date(movie.release_date).getFullYear()})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

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
                {/* Profile link */}
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

                <div style={{ borderTop: "1px solid var(--border)" }} />

                {/* Theme toggle */}
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
                  {/* Toggle pill */}
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

                {/* Sign out */}
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
          </div>{/* end search+profile wrapper */}
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-2 mt-3 overflow-x-auto">
          {[...navLinks, { href: "/profile", label: "Profile" }].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm shrink-0 transition-all px-3 py-1.5 rounded-md ${pathname === link.href ? "font-semibold" : ""}`}
              style={{
                color: pathname === link.href ? "white" : "var(--foreground)",
                backgroundColor: pathname === link.href ? "var(--accent)" : "transparent",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
