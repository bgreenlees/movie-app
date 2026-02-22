"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import ThemeToggle from "@/components/ui/ThemeToggle";
import type { TMDBMovie } from "@/lib/tmdb";

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<TMDBMovie[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSignOut = async () => {
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
    { href: "/watchlist", label: "Want to Watch" },
    { href: "/watched", label: "Watched" },
    { href: "/profile", label: "Profile" },
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
          <div className="hidden md:flex gap-1 shrink-0">
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

          {/* Search bar */}
          <div className="flex-1 max-w-sm relative">
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

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            <ThemeToggle />
            <button
              onClick={handleSignOut}
              className="px-4 py-1.5 text-sm rounded-md transition-colors hover:opacity-80"
              style={{ backgroundColor: "var(--accent)", color: "white" }}
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="md:hidden flex gap-2 mt-3 overflow-x-auto">
          {navLinks.map((link) => (
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
