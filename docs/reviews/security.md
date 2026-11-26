# Security audit: whole app

Issue #28 · audited `main` at `13c56f3` · 2026-11-26 · researcher role

## Summary

No critical or high findings. **Authorization is sound.** Every route that reads or writes user data scopes it to the signed-in user, and this was confirmed with two test users on the dev database: neither could read, edit or delete the other's data, and Watch Together refuses users who aren't connected. No secrets are in client bundles or git history.

The real risks are **abuse and hardening**, not data access:

1. Unauthenticated and unbounded endpoints let anyone burn the shared TMDB and Resend quotas.
2. There are no security headers, so the app can be framed (clickjacking on "Delete account").
3. Write endpoints accept unvalidated sizes and values.

Recommended order: security headers (S) → input validation with limits (M) → rate limiting (M). Then the low-severity items.

**Out of scope:** #69 (dev-only login in `lib/auth*` and `components/auth/LoginForm.tsx`) is being built in parallel and gets its own security review. The register page (#66) is also changing in parallel. Today it has no API of its own: there is no `/api/register`, and sign-up goes through Google.

## Method

- **First pass:** Claude Code `/security-review`, scoped to the whole codebase, since the branch has no diff. Its only finding at ≥8/10 confidence was F7, the email enumeration. It rejected 16 other candidates after tracing them: IDOR on each id route, Prisma operator injection, `dangerouslySetInnerHTML` in `app/layout.tsx` (a static theme script), RSS `href` (React 19 blocks `javascript:` URLs), open redirect via `callbackUrl`, and others. The `/security-review` tool excludes DoS, rate limiting and hardening by design, so those were covered by hand below.
- **Code read:** all 37 route handlers in `app/api/**`, `middleware.ts`, `lib/auth*.ts`, `lib/tmdb.ts`, `next.config.js`, `prisma/schema.prisma`, and the pages that render outside data.
- **Live checks:** local dev server on port 3075 (Node 24), dev database `ep-royal-tooth-…` only. Google is the only provider, so I created two throwaway users (`sec-audit-28-{a,b}@example.test`) and signed session JWTs for them locally with the dev `AUTH_SECRET`. Tokens were never printed and were deleted afterwards. Both users were then deleted through `DELETE /api/user`, which cascaded to their entries and connections, and a recount showed 0 left. One shared `movies` cache row (TMDB id 550, public data) remains.
- **Other checks:** `npm audit`; a scan of 26 client JS chunks (about 4.9 MB) for the literal values of every secret in `.env.local`; a scan of the full git history for secret patterns.
- **Not done:** I did not touch production in any way, including its response headers. I did not send feedback emails, so F4 is confirmed from the code only. I did not fire large TMDB fan-outs (F1, F2).

**Confirmed** = observed on the dev server, or the code path was read end to end with no branch that avoids it. **Suspected** = plausible but not verified.

## Findings

| # | Severity | Finding | Status | Effort |
|---|---|---|---|---|
| F1 | Medium | Unauthenticated TMDB proxy endpoints can exhaust the shared TMDB quota | Confirmed | M |
| F2 | Medium | `POST /api/onboarding` makes one TMDB call per id, with no cap | Confirmed (code) | S |
| F3 | Medium | No security headers: no CSP, no `frame-ancestors`, clickjackable "Delete account" | Confirmed | S |
| F4 | Medium | Feedback form: no rate limit or length cap, so the owner's inbox and the Resend quota can be flooded | Confirmed (code) | S |
| F5 | Medium | Write endpoints don't validate types, ranges or sizes | Confirmed | M |
| F6 | Low | Connection requests can be spammed: no block, re-send after decline, no cap | Confirmed (code) | S |
| F7 | Low | `POST /api/connections` reveals whether an email has an account | Confirmed | S |
| F8 | Low | JWT sessions last 30 days and survive account deletion; no revocation | Confirmed | M |
| F9 | Low | Legacy `users.password` column may still hold real users' password hashes | Suspected | S |
| F10 | Low | `npm audit`: 4 high in the Prisma CLI's build-time dependencies; no audit gate in CI | Confirmed | S |
| F11 | Info | TMDB client class is bundled into client components (no secret leaks) | Confirmed | S |
| F12 | Info | Hardening notes: `trustHost`, `X-Powered-By`, Google `email_verified`, owner email in source, a docs mismatch on the dev host | Mixed | S |

### F1: Unauthenticated TMDB proxy endpoints can exhaust the shared TMDB quota (Medium, confirmed)

- **What:** `middleware.ts:28` excludes `/api` from the auth redirect. 25 of the 37 route handlers never call `auth()`. Most of them proxy TMDB with the app's single `TMDB_API_KEY`. Several make more than one TMDB call per request:
  - `app/api/movies/search/route.ts:18-22`: one search, plus up to `MAX_CANDIDATES = 6` fuzzy retries when there are no results (`lib/fuzzySearch.ts:9`)
  - `app/api/tv/search/route.ts:15-19`: same pattern
  - `app/api/person/[id]/route.ts:17-21`: 3 calls
  - `app/api/tv/[id]/credits/route.ts:16-18`: 2 calls
  - `app/api/discover/*/route.ts:22`: 2 pages
  - `app/api/onboarding/movies/route.ts:17`: 40 detail calls (cached for 24 hours)
  - `app/api/news/route.ts:68`: 10 outside RSS fetches (cached for 30 minutes)

  Responses are cached by URL (`next: { revalidate }`), so varying `q` or `id` bypasses the cache. Observed: `GET /api/genres` without a cookie returns 200.
- **Why it matters:** TMDB rate-limits per API key and per IP, and its terms let it revoke keys that are abused. A script sending random misspelled queries to `/api/movies/search?q=…` causes about 7 TMDB calls per request from Vercel's IPs. Once TMDB starts throttling or blocks the key, search, detail pages and recommendations fail for every user. It also costs Vercel function invocations.
- **Exploit:** `while true; do curl "https://whatsupnext.site/api/movies/search?q=zq$RANDOM$RANDOM"; done` from a few machines.
- **Fix:**
  - Require a session on the proxies that only the signed-in UI uses (search, person, discover, credits, season, recommendations). The public `/movie/[id]` and `/tv/[id]` pages already fetch on the server, so they don't need them.
  - Add per-IP and per-user rate limits for whatever stays public. Two options: a Vercel Firewall rate-limit rule on `/api/*` (no code), or `@upstash/ratelimit` from the Marketplace in middleware.
  - Cap fuzzy retries to signed-in users.
- **Effort:** M

### F2: `POST /api/onboarding` makes one TMDB call per id, with no cap (Medium, confirmed by code)

- **What:** `app/api/onboarding/route.ts:13-46` takes `movieIds` from the body without checking its length or element types. For each id not already in `movies`, it calls `tmdb.getMovieDetails` (line 20), then writes a `movies` row and a watchlist entry, all at once through `Promise.allSettled` (line 15).
- **Why it matters:** One signed-in request with 10,000 integer ids starts 10,000 parallel TMDB calls and up to 20,000 DB writes. That burns the TMDB quota (same impact as F1), can exhaust the Neon pooled connections, and fills `movies` with junk rows. Anyone with a Google account can sign in.
- **Exploit:** `fetch('/api/onboarding', {method:'POST', body: JSON.stringify({movieIds: [...Array(10000).keys()]})})`
- **Fix:** Only accept ids from the curated `MOVIE_IDS` list in `app/api/onboarding/movies/route.ts:5`. Move the list to a shared module and use `movieIds.filter(id => ONBOARDING_IDS.has(id))`. Also cap the length (≤ 40), and run the work through `createLimiter` (`lib/concurrency.ts`) the way mood-picks does.
- **Effort:** S

### F3: No security headers (Medium, confirmed)

- **What:** `next.config.js` has no `headers()`, and middleware sets none. Observed on `/login` from the dev server: no `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` or `Permissions-Policy`, and `X-Powered-By: Next.js` is present.
  - HSTS is **unverified**: Vercel normally adds `Strict-Transport-Security` on its domains, but I didn't request production. The owner can check with `curl -sI https://whatsupnext.site | grep -i strict`.
- **Why it matters:** With no `frame-ancestors` or `X-Frame-Options`, any site can load the app in an invisible iframe. "Delete account" (`app/(main)/profile/page.tsx:160-172`) takes two clicks inside the page and no re-authentication, so a disguised "click here, then here" page can delete a signed-in victim's account. With no CSP, there is no second line of defence if an XSS bug ever appears. `/news` already renders links and images from 10 outside RSS feeds.
- **Fix:** Add `async headers()` to `next.config.js` for `/:path*`:
  - `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` (these two alone close the clickjacking gap)
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `X-Content-Type-Options: nosniff`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
  - `poweredByHeader: false`

  Then add a full CSP in **report-only** mode. Its `img-src` must allow `image.tmdb.org` and the RSS image hosts, `frame-src` must allow `www.youtube.com`, and the inline theme script in `app/layout.tsx:33-37` needs a nonce or hash (Next.js docs: "Content Security Policy", nonce via middleware). Enforce it once reports are clean.
- **Effort:** S for the basic headers; M for an enforced CSP.

### F4: Feedback form can flood the owner's inbox and the Resend quota (Medium, confirmed by code)

- **What:** `app/api/feedback/route.ts:12-22` sends one email per request with no rate limit. It checks that `message` is non-empty but sets no maximum length.
- **Why it matters:** Any signed-in user can loop it: thousands of emails to the owner's personal inbox, and Resend's free-tier daily cap is used up so real feedback stops arriving. Sending from the shared `onboarding@resend.dev` sender at volume also risks deliverability.
- **Fix:**
  - Cap `message` (for example at 5,000 characters) and check `typeof message === "string"`.
  - Rate-limit per user, for example 5 per hour. Use the same limiter as F1, or a `feedback` table with a timestamp to count recent sends.
  - Optionally store feedback in the database and send a daily digest.
- **Effort:** S

### F5: Write endpoints don't validate types, ranges or sizes (Medium, confirmed)

- **What:** Bodies are destructured from `req.json()` and written straight to the database:
  - `app/api/watchlist/[id]/route.ts:28-41`: `rating` is not range-checked. **Observed:** `{"rating": 999}` was stored as 999. POST checks the range (`app/api/watchlist/route.ts:66`); PATCH doesn't.
  - `app/api/tv/watchlist/route.ts:42-82` and `[id]/route.ts:21-32`: no checks at all on `rating`, `currentSeason` or `currentEpisode`.
  - `review` (`@db.Text`, unbounded) on both: **observed** that a 1 MB review was accepted (200).
  - `app/api/user/streaming/route.ts:24-33`: checks only `Array.isArray`. **Observed:** a 20,000-element array was accepted (200). Non-number elements cause a Prisma error, which surfaces as a 500.
  - Wrong types (`movieId: "abc"`, unknown `status`) reach Prisma and come back as 500s instead of 400s. Prisma's own validation stops injection (see `/security-review` rejections), so this is about integrity and cost, not injection.
- **Why it matters:** A user can only corrupt their own rows, but the bad values flow into shared features. A friend's `rating: 999` sorts first in Watch Together's "friend loved" list (`app/api/watch-together/[userId]/route.ts:49-50`). Mood-picks and the recommenders read `rating` as well. Multi-MB reviews inflate database storage, which Neon bills for, and every watchlist response.
- **Fix:** Add a shared schema per route, using `zod` (a common choice, not yet a dependency) or small hand-written guards in `lib/validation.ts` with unit tests:
  - `rating`: integer 1–5
  - `review`: ≤ 2,000 characters
  - `platform` and `watchType`: ≤ 50 characters
  - season and episode: integers 0–500
  - `streamingServices`: ≤ 50 positive integers
  - `status`: in the enum
  - ids: positive integers

  Return 400 on failure.
- **Effort:** M

### F6: Connection requests can be spammed (Low, confirmed by code)

- **What:** `app/api/connections/route.ts:39-66` lets any signed-in user send a request to any registered email. Declining deletes the row (`connections/[id]/route.ts:37`), so the duplicate check at line 52 passes again and the sender can re-send right away. There is no per-user cap and no block.
- **Why it matters:** The request shows the sender's name and email to the target (`connections/route.ts:22-27`). Someone can keep pestering a target who has declined, and the target can't stop it.
- **Fix:** Keep a `DECLINED` status, or a block list, instead of deleting. Refuse re-sends to someone who declined, and cap pending outgoing requests (for example at 20).
- **Effort:** S

### F7: Email enumeration via `POST /api/connections` (Low, confirmed)

- **What:** `app/api/connections/route.ts:47-48` returns `404 "No user found with that email"` for unknown emails, and 200 or 409 for registered ones. **Observed:** 404 for `nobody-…@example.test` and 200 for the second test user.
- **Why it matters:** Anyone who signs in with any Google account can test a list of addresses to learn who uses the app. It only answers yes or no, and a hit sends the target a visible request, so the impact is limited.
- **Fix:** Return the same `200 {"ok": true}` (for example, "If they have an account, they'll see your request") for unknown, existing and already-connected emails. Create the row only when the user exists. Combine with F6's cap.
- **Effort:** S

### F8: JWT sessions last 30 days and survive account deletion (Low, confirmed)

- **What:** `lib/auth.config.ts:5` uses `session: { strategy: "jwt" }` with Auth.js's default `maxAge` of 30 days. There is no server-side session store, so nothing can revoke a token. The `jwt` callback (`lib/auth.ts:15-25`) only touches the database at sign-in. **Observed:** after `DELETE /api/user`, the same cookie still got 200 from `GET /api/user`, and 500 (a foreign-key error) on `POST /api/watchlist`.
- **Why it matters:** A stolen cookie (from a shared computer, say) stays valid for up to 30 days, and signing out on another device doesn't end it. After deletion the token is harmless, because writes fail. The real gap is that a session can't be killed.
- **Fix:** Lower `maxAge` (for example to 7 days, with `updateAge` set to roll it). Add a `sessionVersion` integer on `User`, copy it into the token at sign-in, and check it in the `jwt` callback, with a short cache, so "sign out everywhere" and account deletion invalidate old tokens. Database sessions through the Prisma adapter are the other route.
- **Effort:** M

### F9: Legacy `users.password` column may still hold password hashes (Low, suspected)

- **What:** `prisma/schema.prisma` keeps `password String?` on `User`, but no code reads or writes it: credentials login was removed, and Google is the only provider. CLAUDE.md says production "holds real users' emails and password hashes".
- **Why it matters:** Hashes nobody uses are pure liability. If the database or a backup leaks, people who reuse passwords are exposed elsewhere, and the app gets nothing from keeping them.
- **Fix:** The owner checks on production: `SELECT count(*) FROM users WHERE password IS NOT NULL`. If any, run `UPDATE users SET password = NULL`, then remove the field from the schema and `db push`. That is a production data change, so the owner does it, not an agent.
- **Effort:** S

### F10: Dependencies: 4 high in build-time Prisma packages; no audit gate in CI (Low, confirmed)

- **What:** `npm audit` shows 5 issues (4 high, 1 moderate):
  - `deepmerge-ts` <8 (GHSA-ggr8-5vv4-36mx) and `effect` ≤3.22 (GHSA-38f7-945m-qr2g, GHSA-7589-6fvf-x4pw), both pulled in by `prisma` → `@prisma/config`.
  - The fix offered is `prisma@7`, a major upgrade.
  - `ajv` 6.12.6 (moderate) comes from ESLint only.

  All of them are in the Prisma **CLI's** config loader and ESLint, which run at build and dev time and never in the deployed app (`@prisma/client` doesn't use them). `prisma` is listed under `dependencies` (`package.json:42`), so `npm audit --omit=dev` still reports the 4 high.
- **Why it matters:** Little runtime risk today. But without a gate, a runtime high (for example in `next` or `next-auth`) would only be caught by Dependabot.
- **Recommendation on the CI step:** Yes, add one, but **not `npm audit --audit-level=high` as-is**, because it would fail every PR today on findings that don't affect runtime.
  1. Move `prisma` to `devDependencies`. Vercel installs dev dependencies during the build, so `prisma generate` still works.
  2. Add `npm audit --omit=dev --audit-level=high` to `.github/workflows/ci.yml` after `npm ci`. That gates what ships, while Dependabot keeps handling dev tooling.
  3. Plan the Prisma 7 upgrade separately and read its upgrade guide first.

  This is a CI change, so it goes in its own PR for the owner to review (Trust rules: don't change the gates yourself).
- **Effort:** S

### F11: TMDB client bundled into client components (Info, confirmed)

- **What:** `components/movies/MovieCard.tsx:5` and `components/tv/TVShowCard.tsx:5` (both `"use client"`) import the `tmdb` instance only to call `getPosterUrl`. So the whole `TMDBClient` class ships to the browser. **Observed:** `api.themoviedb.org/3` appears in the client chunks. **No secret leaks:** none of `TMDB_API_KEY`, `RESEND_API_KEY`, `AUTH_SECRET`, `GOOGLE_CLIENT_SECRET` or `DATABASE_URL` appears in the 26 chunks, because Next.js only inlines `NEXT_PUBLIC_*` variables. No `NEXT_PUBLIC_` variables exist, and the git history has no secret patterns.
- **Why it matters:** It's one refactor away from a leak. If someone ever renames the key to `NEXT_PUBLIC_TMDB_API_KEY` "to make it work in the browser", it ships to every visitor.
- **Fix:** Move `getPosterUrl` and the other pure URL helpers to `lib/tmdbImages.ts`, and add `import "server-only"` at the top of `lib/tmdb.ts`, `lib/db.ts` and `lib/auth.ts`, so the build fails if client code imports them.
- **Effort:** S

### F12: Hardening notes (Info)

- **`trustHost: true`** (`lib/auth.config.ts:4`): fine on Vercel, where the platform sets `Host`, and `NEXTAUTH_URL` is set in production. It only matters if the app is ever self-hosted behind a proxy that passes `Host` through. No change needed; keep it in mind.
- **Google `email_verified` is not checked** (`lib/auth.ts:16-21`): users are linked by email alone. Google accounts normally have verified emails, so this is a defence-in-depth gap only. Add a `signIn` callback that rejects `profile.email_verified !== true`. S.
- **Owner's email is hard-coded** in `app/api/feedback/route.ts:19` in a public repo. Move it to a `FEEDBACK_TO` env var. S.
- **Docs mismatch on the dev host:** `.env.example:10` says the dev branch is `ep-sparkling-resonance-…`, but CLAUDE.md and the pulled dev `DATABASE_URL` say `ep-royal-tooth-…`. Agents rely on this string as the safety check before destructive scripts, so fix `.env.example`. S.
- **Checked and fine:**
  - All 37 routes: every user-data route calls `auth()` and scopes by `session.user.id`.
  - The PATCH/DELETE ownership checks on `watchlist/[id]` and `tv/watchlist/[id]` were observed returning 404 for the other test user.
  - Only the addressee can accept a connection: observed a 404 when the requester tried to accept their own request.
  - `watch-together/[userId]` requires an ACCEPTED connection: observed a 403 without one. It returns the friend's email only to accepted friends.
  - No raw SQL anywhere (`$queryRaw` and friends are unused).
  - Route `id` params go through `parseInt`, so they can't change TMDB paths.
  - The redirect after sign-in is hard-coded (`LoginForm.tsx:11`).
  - Auth.js supplies CSRF protection and `SameSite=Lax`, `HttpOnly` cookies.
  - The app has no endpoint for login or register attempts (Google OAuth handles them), so login rate limiting and error-message enumeration don't apply until #69. Its dev-only login must stay impossible to enable in production; that belongs in #69's review.

## Sources

- Next.js, `headers` in `next.config.js` and the Content Security Policy guide: https://nextjs.org/docs/app/api-reference/config/next-config-js/headers, https://nextjs.org/docs/app/guides/content-security-policy (read 2026-11-26)
- Next.js, environment variables (only `NEXT_PUBLIC_` is inlined into the client): https://nextjs.org/docs/app/guides/environment-variables
- Next.js, the `server-only` package: https://nextjs.org/docs/app/getting-started/server-and-client-components
- Auth.js, session strategies and `maxAge`: https://authjs.dev/concepts/session-strategies
- OWASP, Clickjacking Defense Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Clickjacking_Defense_Cheat_Sheet.html
- GitHub advisories: GHSA-ggr8-5vv4-36mx, GHSA-38f7-945m-qr2g, GHSA-7589-6fvf-x4pw (from `npm audit`, 2026-11-26)
- Vercel Firewall rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
