"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import toast from "react-hot-toast";

export default function Navbar() {
  const pathname = usePathname();

  const handleSignOut = async () => {
    await signOut({ redirect: true, callbackUrl: "/login" });
    toast.success("Logged out successfully");
  };

  const navLinks = [
    { href: "/search", label: "Search" },
    { href: "/watchlist", label: "Want to Watch" },
    { href: "/watched", label: "Watched" },
  ];

  return (
    <nav className="border-b border-[var(--border)] bg-white">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/watchlist" className="text-xl font-bold" style={{ color: "var(--primary)" }}>
              Movie Watchlist
            </Link>

            <div className="hidden md:flex gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`transition-colors ${
                    pathname === link.href
                      ? "font-medium"
                      : ""
                  }`}
                  style={{
                    color: pathname === link.href ? "var(--accent)" : "var(--foreground)",
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>

          <button
            onClick={handleSignOut}
            className="px-4 py-2 text-sm rounded-md transition-colors hover:opacity-80"
            style={{ backgroundColor: "var(--primary)", color: "white" }}
          >
            Sign Out
          </button>
        </div>

        <div className="md:hidden flex gap-4 mt-4">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-sm transition-colors ${
                pathname === link.href ? "font-medium" : ""
              }`}
              style={{
                color: pathname === link.href ? "var(--accent)" : "var(--foreground)",
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
