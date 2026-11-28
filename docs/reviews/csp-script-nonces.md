# Removing `'unsafe-inline'` from `script-src`: nonces vs hashes

Issue #138 · Researched 2026-11-27 against Next.js 16.4.6 (the installed version) · Docs only, no app code changed

## Summary

**Recommendation: use per-request nonces, set in `middleware.ts`, with `'strict-dynamic'`. Allow the one inline theme script in `app/layout.tsx` by its SHA-256 hash.** Then drop `'unsafe-inline'` and the `https://vercel.live` host from `script-src`.

- **The usual cost of nonces is already paid.** Nonces force every page to render on each request. In a local production build, **every page in this app is already dynamic** (`ƒ`). The cause is `auth()` in `app/not-found.tsx`. What's left is a `crypto.randomUUID()` and a header per page request. Middleware already runs `auth()` on each of those requests anyway.
- **Hashes alone can't do it.** Next.js streams page data to the browser as inline `self.__next_f.push(…)` scripts. They differ on every page and every request, so their hashes can't be listed ahead of time. Next's experimental SRI only adds hashes to *external* script files. It left 11 inline scripts on `/register`.
- **Prototype result:** an enforced nonce policy gave **0 CSP violations** on `/`, `/login`, `/register`, a 404, and the signed-out redirects. A deliberately injected inline script was blocked.
- **Main risk:** the Vercel Toolbar on Preview deployments may be blocked, because `'strict-dynamic'` ignores host allowlists. This can only be checked on a real Preview.
- **Effort: M** (one worker PR). It must merge before `ENFORCE_CSP_IN_PRODUCTION` is switched on.

## Background

`lib/securityHeaders.ts:41` allows `'unsafe-inline'` in `script-src`. That lets any inline `<script>` run, which is exactly what an XSS bug would inject, so the CSP adds little protection against injected scripts (#137 review, finding 1). The policy goes out from `next.config.ts` `headers()`. It is the same static string on every response, which is why it can't carry a per-request nonce today.

Three ways to allow only *our* inline scripts:

| | What it is | Works for Next's own inline scripts? |
|---|---|---|
| **Nonce** | A random value, new on every response, put in the CSP header and on each allowed `<script nonce="…">`. An attacker can't guess it. | Yes. Next reads the nonce from the request's CSP header and adds it to all its scripts (Next.js CSP guide, "How nonces work"). |
| **Hash** | `'sha256-…'` of a script's exact text, listed in the CSP. | Only for scripts whose text is fixed at build time. |
| **SRI** (`experimental.sri`) | Next adds `integrity` hashes to external `<script src>` tags at build time. | No. It doesn't cover inline scripts (observed below). |

## Findings, ranked by impact

### 1. Hash-based CSP (including Next's experimental SRI) can't remove `'unsafe-inline'` — **Observed**

- **What:** I built with `experimental: { sri: { algorithm: "sha256" } }`, served the build with `next start`, and fetched `/register`. It had 10 external scripts, 6 of them with `integrity` (4 async chunks had none), and **11 inline scripts**: the theme script, one Turbopack bootstrap (`<script id="_R_">`), and nine `self.__next_f.push([1,"…"])` data chunks.
- **Why it matters:** the `__next_f` chunks hold the page's data, so their text changes on every page. Signed-in pages also include the user's own data, so their text changes on every request. You can't list hashes for them in a header in advance. A hash-only `script-src` would break hydration on every page. So the hash option only helps if `'unsafe-inline'` stays, which is the thing we're trying to remove.
- **Evidence:** local build output (scratch, not committed). Next.js CSP guide, bundled at `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, "Subresource Integrity (Experimental)". It lists "Build-time only: Cannot handle dynamically generated scripts" as a limitation and marks the feature experimental.
- **Effort:** n/a. Rejected.

### 2. Every page is already dynamically rendered, so nonces add almost no cost — **Observed**

- **What:** `next build` lists all 21 pages as `ƒ (Dynamic)`, including `/`, `/register`, `/watchlist` and `/_not-found`. Only the icons and the manifest are static. I removed the `auth()` call in `app/not-found.tsx:8` as a temporary test, and 15 pages became static (`○`). So that call is the cause: the root not-found boundary is part of every route, and `auth()` reads cookies. Removing the middleware made no difference.
- **Why it matters:** the Next.js guide warns that nonces mean "no static pages, no ISR, no PPR, no CDN cache for HTML", plus slower first loads and more server work. We're already in that state. `/register` is already served with `Cache-Control: private, no-cache, no-store`. Middleware already runs `auth()` on every page request. So the extra cost is one random UUID and one header per request: no new function invocations, no lost CDN caching.
- **The trade-off it locks in:** if someone later makes the not-found page static to get static pages back, nonces would undo that. Keeping static pages would then need Vercel's "nonces with CDN cache" technique: middleware fetches the cached HTML and adds the nonce itself (Vercel KB, 2026-09-04). That's more complex and not worth it at this app's traffic. Write this down in a code comment so it doesn't come as a surprise.
- **Evidence:** local build output. Next.js CSP guide, "Static vs Dynamic Rendering with CSP".
- **Effort:** none. This is the existing state.

### 3. A nonce + `'strict-dynamic'` policy ran with zero violations — **Observed (public pages only)**

- **What:** as a temporary prototype, I edited `middleware.ts`. It generated `Buffer.from(crypto.randomUUID()).toString("base64")` and built the policy with `contentSecurityPolicy(false)`, with `script-src` replaced by:

  ```
  script-src 'self' 'nonce-<per request>' 'strict-dynamic' 'sha256-gxNfGsSxUqGFdaO1yv9YCXy/KFUQjL22jNwRkaHoeao='
  ```

  It set that policy on the **request** headers (so Next can read the nonce) and on the response as an enforced `Content-Security-Policy`. I built and served it, then loaded pages in headless Chromium with a fresh profile, listening for `securitypolicyviolation` events and CSP console errors:

  | Page | Result | Scripts carrying the nonce | Violations |
  |---|---|---|---|
  | `/` | 200 | 18 | 0 |
  | `/register` | 200 | 21 | 0 |
  | `/login` | 200 | 20 | 0 |
  | `/no-such-page` (redirects to login) | 200 | 20 | 0 |
  | `/watchlist` (redirects to login) | 200 | 20 | 0 |
  | `/movie/550` (404, placeholder TMDB key) | 404 | 16 | 0 |

  The theme script still applied a saved `theme=dark` after a reload under its hash. **Negative control:** I injected `<script>window.__injected=1</script>` into the HTML on the way to the browser. It did not run, and Chromium logged "Executing inline script violates … script-src".
- **Why it matters:** it shows the Next.js 16.4 automatic nonce works in this app with no code changes to pages. It also shows the new policy really stops injected inline scripts, which the current one doesn't.
- **Not covered (to check in the worker PR):** signed-in pages (needs the dev database and dev login), `next dev` (dev enforces the CSP and needs `'unsafe-eval'`), the YouTube trailer modal, Google sign-in, and the Vercel Toolbar on a Preview. I **suspect** signed-in pages behave the same, because they use the same framework scripts and there are no `next/script` or third-party `<script>` tags in `app/`, `components/` or `lib/` (grep). But that's not verified.
- **Effort:** M for the real change, including tests and checks.

### 4. The Vercel Toolbar on Preview may be blocked — **Suspected, needs a Preview check**

- **What:** in browsers that support `'strict-dynamic'`, host sources like `https://vercel.live` in `script-src` are ignored. Only scripts with the nonce or hash, and scripts they load, may run. Vercel's Toolbar CSP docs (last updated 2026-08-11) only list host allowlists (`script-src https://vercel.live`). They don't say whether the script Vercel injects on Previews carries the page's nonce.
- **Why it matters:** Preview deployments enforce the CSP (`cspMode`, `lib/securityHeaders.ts:24-28`). If the Toolbar's tag is added without our nonce, comments and the Toolbar would stop working on Previews. Production would be unaffected.
- **What to do:** in the worker PR, open its Preview with the browser console open. If the Toolbar is blocked, pick one: (a) accept it (the Toolbar is a convenience); (b) on Preview only, add the Toolbar's script by its hash if the tag is a fixed inline loader; or (c) have the owner turn the Toolbar off for the project. Don't put `'unsafe-inline'` back.
- **Evidence:** https://vercel.com/docs/vercel-toolbar/managing-toolbar. The `'strict-dynamic'` behaviour is from CSP Level 3 (MDN, "script-src: strict-dynamic").
- **Effort:** S once observed.

### 5. The theme script: hash it instead of reading the nonce in the root layout — **Observed (hash), design choice**

- **What:** Next adds the nonce to its *own* scripts only. The hand-written `<script dangerouslySetInnerHTML>` at `app/layout.tsx:40-46` needs either `nonce={(await headers()).get("x-nonce")}` (the guide's pattern), or its hash in the policy (what I tested).
- **Why I recommend the hash:** the root layout stays synchronous and doesn't read headers. The script's text is fixed, so its hash never changes per request. The cost is that editing the script means updating the hash. Prevent drift by moving the script text into an exported constant (e.g. `lib/themeScript.ts`), computing its SHA-256 with `node:crypto` where the policy is built, and adding a unit test that the policy contains it. The nonce-prop route is also fine. It's the documented pattern, but untested here.
- **Effort:** S (part of the main PR).

### 6. Where the header has to move — **Observed**

- **What:** a per-request nonce can't come from `next.config.ts` `headers()`, which is static. The page CSP has to be set in middleware. If `next.config.ts` keeps sending its own CSP, the browser applies **both** policies (a script must pass each one), and the old report-only copy keeps reporting against `'unsafe-inline'`. In the prototype, both headers were present on page responses.
- **So:** `next.config.ts` keeps the non-CSP headers and a minimal `frame-ancestors 'none'` CSP for everything, which covers `/api/*` and static files that middleware skips. Middleware sets the full nonce policy on page responses. It keeps the `cspMode` switch (enforce in dev/Preview, report-only in Production until `ENFORCE_CSP_IN_PRODUCTION` is flipped). `contentSecurityPolicy()` takes the nonce as an argument so it stays a pure, unit-tested function.
- **Also noted:** the build warns that the `middleware.ts` file convention is deprecated in Next 16 in favour of `proxy.ts` (`npx @next/codemod@canary middleware-to-proxy .`). This is a separate rename. Don't mix it into the CSP PR.
- **Effort:** included in the main PR.

## How I tested (all local, reverted)

- `npm install`, placeholder `DATABASE_URL`. I did **not** pull any env, touch any database, or run `npm run build` or migrations. I ran `npx next build` directly with placeholder `AUTH_SECRET` / `TMDB_API_KEY` / `RESEND_API_KEY` values, then `next start -p 3338 -H 127.0.0.1`.
- Four throwaway builds: baseline, SRI on, no middleware, and not-found without `auth()`. Then one nonce prototype checked with Playwright Chromium (fresh context).
- I reverted every temporary edit (`git checkout`), deleted `.next/`, and stopped only my own server PID. No test users or rows were created.

## Sources

- Next.js "How to set a Content Security Policy", bundled with next 16.4.6: `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md` (also https://nextjs.org/docs/app/guides/content-security-policy)
- Vercel, "Managing the toolbar" (CSP section): https://vercel.com/docs/vercel-toolbar/managing-toolbar, last updated 2026-08-11
- Vercel KB, "CSP nonces with CDN cache": https://vercel.com/kb/guide/csp-nonces-with-cdn-cache, 2026-09-04
- MDN, CSP `script-src` (`'strict-dynamic'`, nonces, hashes): https://developer.mozilla.org/docs/Web/HTTP/Headers/Content-Security-Policy/script-src
