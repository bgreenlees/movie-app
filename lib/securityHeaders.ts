// Response headers for every route (security audit F3). Imported by next.config.ts.

type Header = { key: string; value: string };

/**
 * The full Content-Security-Policy, sent as Report-Only for now: browsers log
 * violations to the console but block nothing. Once it's quiet on real pages,
 * switch it to an enforced Content-Security-Policy (ideally with nonces; see
 * Next.js "Content Security Policy" guide).
 */
export function contentSecurityPolicy(isDev: boolean): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' covers the theme script in app/layout.tsx and Next's inline
    // bootstrap scripts until nonces are added. React needs eval only in dev.
    // vercel.live is the Vercel Toolbar on preview deployments.
    "script-src": ["'self'", "'unsafe-inline'", "https://vercel.live", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    // TMDB posters plus /news, whose images come from many RSS feeds' CDNs.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "https://vercel.live", "wss://ws-us3.pusher.com", ...(isDev ? ["ws:"] : [])],
    // YouTube trailers (components/movies/TrailerModal.tsx).
    "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com", "https://vercel.live"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Google sign-in redirects through accounts.google.com.
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(isDev: boolean): Header[] {
  return [
    // Both stop other sites framing the app (clickjacking, e.g. a disguised "Delete account").
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(isDev) },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
