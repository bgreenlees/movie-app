// Response headers for every route (security audit F3). Imported by next.config.ts.

type Header = { key: string; value: string };

/** Where browsers send CSP violation reports (app/api/csp-report/route.ts). */
export const CSP_REPORT_PATH = "/api/csp-report";
const REPORT_GROUP = "csp-endpoint";

/**
 * Production keeps the CSP report-only until a week of reports from real users
 * shows nothing unexpected (issue #127); then set this to true. Local dev and
 * Preview deployments already enforce it, so breakage shows up before production.
 */
export const ENFORCE_CSP_IN_PRODUCTION = false;

export type CspMode = "enforce" | "report-only";

/**
 * Enforce in local `next dev` and on Vercel Preview / Development builds. Anything
 * else (Production, or a build where VERCEL_ENV is somehow missing) stays
 * report-only until ENFORCE_CSP_IN_PRODUCTION is flipped, so a surprise can't
 * break production.
 */
export function cspMode(nodeEnv: string | undefined, vercelEnv: string | undefined): CspMode {
  if (ENFORCE_CSP_IN_PRODUCTION) return "enforce";
  if (nodeEnv === "development") return "enforce";
  return vercelEnv === "preview" || vercelEnv === "development" ? "enforce" : "report-only";
}

/**
 * The full Content-Security-Policy. Still allows 'unsafe-inline' scripts; nonces
 * would remove that but make every page dynamically rendered (Next.js CSP guide).
 */
export function contentSecurityPolicy(isDev: boolean): string {
  // The Vercel Toolbar on preview deployments needs these (vercel.com/docs/vercel-toolbar/managing-toolbar).
  const toolbar = "https://vercel.live";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'unsafe-inline' covers the theme script in app/layout.tsx and Next's inline
    // bootstrap scripts until nonces are added. React needs eval only in dev.
    "script-src": ["'self'", "'unsafe-inline'", toolbar, ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'", toolbar],
    // TMDB posters plus /news, whose images come from many RSS feeds' CDNs.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:", toolbar, "https://assets.vercel.com"],
    "connect-src": ["'self'", toolbar, "wss://ws-us3.pusher.com", ...(isDev ? ["ws:"] : [])],
    // YouTube trailers (components/movies/TrailerModal.tsx).
    "frame-src": ["https://www.youtube.com", "https://www.youtube-nocookie.com", toolbar],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    // Google sign-in redirects through accounts.google.com.
    "form-action": ["'self'", "https://accounts.google.com"],
    "frame-ancestors": ["'none'"],
    // report-uri for Firefox/Safari; report-to (the Reporting API) for Chromium.
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [REPORT_GROUP],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

export function securityHeaders(isDev: boolean, mode: CspMode): Header[] {
  const csp = contentSecurityPolicy(isDev);
  return [
    // Both stop other sites framing the app (clickjacking, e.g. a disguised "Delete account").
    { key: "X-Frame-Options", value: "DENY" },
    // In report-only mode, still enforce frame-ancestors on its own.
    ...(mode === "enforce"
      ? [{ key: "Content-Security-Policy", value: csp }]
      : [
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Content-Security-Policy-Report-Only", value: csp },
        ]),
    { key: "Reporting-Endpoints", value: `${REPORT_GROUP}="${CSP_REPORT_PATH}"` },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
