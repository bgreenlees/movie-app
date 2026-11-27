// Single source of truth for the main navigation, shared by the desktop top bar
// and the mobile bottom tab bar so the two can't drift apart.

export interface NavLink {
  href: string;
  /** Full name: desktop nav, accessible name on mobile. */
  label: string;
  /** Short label for the narrow mobile tab bar (five tabs share ~64px each at 320px). */
  shortLabel: string;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/search", label: "Discover", shortLabel: "Discover" },
  { href: "/what-to-watch", label: "What to Watch", shortLabel: "Watch" },
  { href: "/new-releases", label: "New Releases", shortLabel: "New" },
  { href: "/news", label: "News", shortLabel: "News" },
  { href: "/watchlist", label: "My Movies", shortLabel: "Movies" },
  { href: "/tv/watching", label: "My TV", shortLabel: "TV" },
];

/** Links shown as tabs on mobile. News moves into the profile menu to keep the bar to five. */
export const TAB_HREFS = ["/search", "/what-to-watch", "/new-releases", "/watchlist", "/tv/watching"];

/** True when `pathname` is the link's page or a page nested under it. */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
