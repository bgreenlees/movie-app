"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LINKS, TAB_HREFS, isActivePath } from "@/lib/navLinks";

const ICONS: Record<string, string> = {
  "/search": "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  "/what-to-watch": "M13 10V3L4 14h7v7l9-11h-7z",
  "/new-releases": "M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z",
  "/watchlist": "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  "/tv/watching": "M9 17v2m6-2v2m-8 0h10M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z",
};

/** Mobile/tablet primary navigation (hidden from lg up, where the top bar shows every link). */
export default function BottomTabBar() {
  const pathname = usePathname();
  const tabs = NAV_LINKS.filter((l) => TAB_HREFS.includes(l.href));

  return (
    <nav
      aria-label="Main"
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[var(--border)] bg-[var(--card-bg)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex">
        {tabs.map((link) => {
          const active = isActivePath(pathname, link.href);
          return (
            <li key={link.href} className="flex-1 min-w-0">
              <Link
                href={link.href}
                aria-label={link.label}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] leading-none"
                style={{ color: active ? "var(--accent)" : "var(--text-muted)", fontWeight: active ? 700 : 500 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.25 : 1.75} d={ICONS[link.href]} />
                </svg>
                <span className="truncate max-w-full px-1">{link.shortLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
