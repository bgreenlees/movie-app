// Security headers (security audit F3). Static ones are set in next.config.ts; the page
// Content-Security-Policy is built per request in middleware.ts.

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
 * The full page Content-Security-Policy, built per request by middleware.ts.
 *
 * Scripts run only if they carry this request's nonce (Next.js adds it to all of its
 * own scripts, reading it from the request's CSP header) or match one of
 * `scriptHashes` (the theme script, lib/themeScript.ts). 'strict-dynamic' lets those
 * scripts load further chunks, and makes browsers ignore host allowlists in script-src,
 * so there is no 'unsafe-inline' and no https://vercel.live there: an injected inline
 * script is blocked.
 *
 * Nonces assume every page is dynamically rendered. Today they all are: auth() in
 * app/not-found.tsx reads cookies, and the root not-found boundary is part of every
 * route (docs/reviews/csp-script-nonces.md §2). A statically rendered page would be
 * built without a nonce and its scripts would be blocked, so if you make pages static
 * again, plan for that first (e.g. Vercel's "CSP nonces with CDN cache" technique).
 */
export function contentSecurityPolicy({
  nonce,
  scriptHashes = [],
  isDev,
}: {
  nonce: string;
  scriptHashes?: string[];
  isDev: boolean;
}): string {
  // The Vercel Toolbar on preview deployments needs these (vercel.com/docs/vercel-toolbar/managing-toolbar).
  const toolbar = "https://vercel.live";
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'self' is a fallback for browsers without 'strict-dynamic' (CSP Level 2).
    // React needs eval only in dev.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...scriptHashes,
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Styles keep 'unsafe-inline' (React style props, next/font, react-hot-toast).
    // Don't add the nonce here: a nonce makes browsers ignore 'unsafe-inline'.
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

/** Which header carries the page CSP: enforced, or report-only (see cspMode). */
export function cspHeaderName(mode: CspMode): string {
  return mode === "enforce" ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only";
}

/** A fresh, unguessable nonce for one response: 128 random bits, base64. */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Static headers for every route, set in next.config.ts. The full page CSP isn't here:
 * it needs a per-request nonce, so middleware.ts sets it. This minimal CSP still stops
 * framing on the responses middleware skips (/api/*, static files), in every mode.
 */
export function securityHeaders(): Header[] {
  return [
    // Both stop other sites framing the app (clickjacking, e.g. a disguised "Delete account").
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
    { key: "Reporting-Endpoints", value: `${REPORT_GROUP}="${CSP_REPORT_PATH}"` },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ];
}
