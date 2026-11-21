# Dev environment review

Issue #10 · reviewed 2026-11-21 against `main` @ `154b01d`

The goal: a setup that's reasonable for one developer (plus AI agents working in parallel worktrees) and that builds good habits, without going enterprise.

## Summary

Phase 0 got the foundations right: a separate Neon `dev` database, ESLint 9, Vitest, a required `ci` check, and branch protection that applies to admins too. The repo is already set to squash-merge only, delete branches on merge, and run secret scanning with push protection.

The biggest gaps are **security patches**, **who can sign in to production**, and **seeing errors in production**:

1. The production app runs `next@16.1.1` and `next-auth@5.0.0-beta.30`, and both have critical advisories that a non-breaking `npm audit fix` resolves. One of them makes auth checks "fail open". This app's login gate depends on that check.
2. Production shares its `AUTH_SECRET` with Development and Preview. Every worktree pulls the Development variables, so any of them could forge a production login.
3. When something breaks in production, nothing tells you. Errors go to `console.error` and stay in Vercel's short-lived runtime logs.

Effort: **S** = under an hour, **M** = an afternoon, **L** = a day or more.
Status: ✅ done in this PR · 🔧 needs you to change a setting · 📋 proposed follow-up.

## Findings, ranked by value

### 1. Patch the critical Next.js and Auth.js vulnerabilities — 📋 S

`npm audit` reports 15 vulnerabilities (3 critical, 8 high), all in production dependencies. The important ones:

- **next 16.1.1**: several *middleware/proxy bypass* advisories. This app's login gate lives in `middleware.ts`. There are also SSRF and remote-code-execution advisories in the image optimiser, which this app uses for TMDB posters. Fixed in 16.4.6.
- **next-auth 5.0.0-beta.30 / @auth/core**: "configuration errors can cause existence-based auth checks to fail open". `middleware.ts` does exactly that kind of check (`!!req.auth`). Fixed in beta.32.
- **zod 4.3.4**: memory exhaustion on oversized input. Fixed in 4.6.7.

**Why it matters:** the site is public, and the repo is too. Most of these are fixed by patch and minor upgrades inside the version ranges `package.json` already allows. That makes this cheap, high-value work.

**How:** on a fresh branch, run `npm audit fix` (without `--force`), then type-check, lint, test, and click through login, search and watchlist on the Vercel preview before merging. The remaining advisories come through Prisma's own tooling and need Prisma 7, which is a major upgrade. Track that separately (item 12).

This PR doesn't include the upgrade on purpose. It changes the lockfile and app behaviour, so it deserves its own PR and preview check. It would also clash with the lockfile changes in the sibling worktrees.

### 2. Turn on Dependabot alerts and security updates — 🔧 S · version updates ✅

Dependabot alerts and Dependabot security updates are both **disabled** in the repo settings. That's why the problems in item 1 went unnoticed.

- ✅ Added `.github/dependabot.yml`. Every Monday it opens one grouped PR with all minor and patch updates, plus separate PRs for major versions. GitHub Actions versions get a monthly check.
- 🔧 You: **Settings → Advanced Security → enable "Dependabot alerts" and "Dependabot security updates"**. Alerts email you when a new advisory affects a dependency. Security updates open a fix PR straight away instead of waiting for Monday.

**Why it matters:** dependencies go stale quietly. A weekly PR that has to pass CI turns "upgrade everything once a year, painfully" into "merge a green PR every week". **Why Dependabot and not Renovate:** Dependabot is built into GitHub, needs no app install, and grouping covers what a solo repo needs. Renovate is more configurable, but that's more than this project needs.

### 3. Give Production its own `AUTH_SECRET` — 🔧 S

`AUTH_SECRET` is one variable shared by Production, Preview and Development. Sessions use the JWT strategy (`lib/auth.config.ts`), so anyone holding the secret can mint a valid session cookie for any user ID. Every worktree runs `vercel env pull` for Development, so every agent and every `.env.local` on your laptop has the key to production logins.

**How:** in Vercel, edit `AUTH_SECRET` so it covers only Preview and Development. Then add a new Production-only value (`npx auth secret` generates one) and mark it **Sensitive**, so it can't be read back. Redeploy production. Everyone gets signed out once.

**Also worth doing:**
- `CRON_SECRET` exists in Production, but no code reads it and there's no cron config. Delete it, or document what it's for.
- Google OAuth, TMDB and Resend keys are also shared across environments. That's acceptable for a solo app, because those keys can't impersonate users. A separate Google OAuth client for dev is the tidy option, but it can wait.

**Why it matters:** "least privilege" isn't enterprise paperwork. The dev environment gets copied into many places, so it shouldn't hold anything that controls production.

### 4. See production errors without having to look — 📋 M

Today, the API routes `catch` errors and `console.error` them (22 call sites). Vercel keeps runtime logs only briefly, and nothing alerts you. There's no `app/error.tsx` or `app/global-error.tsx` either, so a rendering crash shows users Next's bare default error screen.

**Proposed (in this order):**
1. Add `app/error.tsx` and `app/global-error.tsx`: friendly "something went wrong, try again" screens (S).
2. Add an error tracker with alerting. Sentry's free tier is the standard choice for Next.js, and it installs through the Vercel Marketplace, so the env vars get wired up for you. Its Next.js SDK hooks into `instrumentation.ts` (`onRequestError`), which catches server errors that never reach a `catch` (M).
3. Optional: Vercel Web Analytics or Speed Insights if you want traffic and performance data. They're not needed for errors.

**Why it matters:** without alerts, a user is the first to notice a broken page, or nobody is. Error tracking also groups repeat errors and shows the stack trace and the release that introduced them. That's what makes "fix the bug, add a test so it can't come back" possible.

### 5. Pin the Node version — ✅ S (+ 🔧 install a version manager)

Before this PR, Node was pinned in three different places:
- Vercel project setting: **24.x**
- CI: `node-version: 24`
- Your Mac: **v26.13.0**, with no version manager installed.

So local dev ran on a newer Node than production. Code that works on 26 can fail on 24 (new APIs, different defaults), and you'd only find out after deploying.

- ✅ `.nvmrc` containing `24`: a single source of truth that version managers read automatically.
- ✅ `"engines": { "node": "24.x" }` in `package.json`. Vercel reads this, and `npm install` warns when your Node doesn't match.
- ✅ CI now reads the version from `.nvmrc` (`node-version-file`) instead of hard-coding it.
- 🔧 You: install a version manager and use Node 24 locally. `fnm` is fast and simple:
  ```bash
  brew install fnm
  echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc   # auto-switches when you cd into the repo
  exec zsh
  fnm install 24
  ```
  After that, every worktree switches to Node 24 automatically.

To move to Node 26 later, change `.nvmrc`, `engines` and the Vercel setting in one PR.

### 6. Require branches to be up to date before merging — 🔧 S

Branch protection requires `ci`, but **"Require branches to be up to date before merging" is off** (`strict: false`). With several agents opening PRs from the same `main` at the same time, PR A and PR B can each pass CI on their own and still break `main` when combined. For example, A renames a function that B starts calling.

**How:** Settings → Branches → `main` rule → tick "Require branches to be up to date before merging". Also, under Settings → General, tick "Always suggest updating pull request branches", which adds an **Update branch** button to PRs.

**Trade-off:** after each merge, the other open PRs need that button pressed and CI to run again. That's a few minutes of waiting, and it buys a `main` that is always tested as it actually is.

### 7. Make squash commits read well — 🔧 S

Squash merging and auto-deleting branches are already on. 👍 The squash commit message is currently "commit or PR title" plus **all the branch's commit messages**. That fills `main`'s history with "fix lint", "wip" and so on.

**How:** Settings → General → Pull Requests → "Allow squash merging" → default message **"Pull request title and description"**. `main` then gets one clean commit per PR, with the *why* from the PR body attached. The new PR template helps with that (item 8).

### 8. PR template — ✅ S

Added `.github/pull_request_template.md` with What / Why / How tested / Risk sections, and a checklist: type-check, lint and tests pass; tests added for logic and bug fixes; preview checked for UI changes.

**Why it matters:** the template prompts you to write down *why* while it's fresh. Because squash commits now carry the PR description (item 7), that reasoning ends up in `git log` too. It also tells agents what "done" means.

### 9. Env & secrets housekeeping — ✅ S

- ✅ Added `.env.example`: every variable the code reads, what it's for, and where it comes from. No values.
- ✅ Fixed `.gitignore`. Its `.env*` rule also ignored `.env.example`, so a template could never have been committed. Added `!.env.example`.
- Good already: secret scanning and push protection are on (important, since the repo is public), `.env*` files are ignored, and no env file appears anywhere in git history.
- 📋 Consider: the `dev` branch is a full copy of production, **including real users' emails and password hashes**, and many local tools and agents can reach it. Neon can create a branch with the schema but no data, or you can run a small script that anonymises emails after `neon branches reset`. That's M effort, and worth it before the user base grows.

### 10. Per-worktree setup in Orca — ✅ documented · 📋 script S

Each worktree starts without `node_modules` or `.env.local`, and every agent has to rediscover the steps. ✅ CLAUDE.md now has a "Worktrees (Orca)" section with the exact steps: Node version, `npm install`, `vercel env pull`, `prisma generate`, and one port per dev server.

📋 Follow-up: add a `scripts/setup-worktree.sh` that runs those steps and can safely be run twice, and set it as the repo's setup command in Orca (if your Orca version supports per-repo setup scripts). Then a new worktree is ready the moment it's created.

📋 Housekeeping: the `bunyip` worktree (branch `bgreenlees/check-git-worktree-status`) is 3 weeks old, has no PR, and sits on an old commit that still has `.eslintrc.json`. If it's not needed: `git worktree remove ../bunyip`, then `git branch -D bgreenlees/check-git-worktree-status`. Old worktrees confuse agents and use disk space.

### 11. One build command, not two — 📋 S

`package.json`'s `build` script runs `prisma generate && prisma migrate deploy && next build`. But Vercel's project settings **override** it with `npx prisma generate && next build`, so the `migrate deploy` step never runs in production. Meanwhile it makes `npm run build` dangerous to run locally. CLAUDE.md now says this explicitly ✅.

**Proposed:** change the script to `prisma generate && next build` and clear the override in Vercel, so `package.json` is the only definition. That also makes `npm run build` safe locally, and CI could run it (with placeholder env) to catch build-only errors that `tsc` misses. Do this together with item 12, because it's part of deciding how schema changes reach production.

### 12. Decide how schema changes reach production — 📋 M

Schema changes go through `prisma db push`, and `prisma/migrations` is gitignored. It's not written down how production's schema gets updated (presumably by running `db push` against production by hand). `db push` keeps no history and will happily drop a column, along with its data, if the schema says so.

**Proposed:** write a short checklist into CLAUDE.md now:
1. Run `db push` on `dev`.
2. Check the app on the preview.
3. Take a Neon snapshot or branch of production.
4. Run `db push` against production.
5. Merge.

Later, move to Prisma Migrate: commit the `migrations/` folder and let the build run `migrate deploy`. Migrations are reviewed in PRs like any other code. That's the standard practice once real users depend on the data.

Also check your Neon plan's point-in-time restore window for `production`, so you know how far back you could recover.

Related: Prisma 7 (and the audit fixes in its tooling) is a major upgrade with config changes. Do it in its own PR after this decision.

### 13. README and CLAUDE.md accuracy — ✅ S

**README:**
- Setup no longer says `npx prisma db push`. That would have pushed the schema to whatever database you'd pointed it at.
- Setup now uses `vercel env pull` with the dev database, and lists Node 24 and the Vercel CLI as prerequisites.
- Commands now include type-check and test, plus a warning not to run `npm run build` locally and an explanation of what Vercel actually runs.
- `NEXTAUTH_URL` is no longer listed for local use. CLAUDE.md says it's production-only.
- The title is now the real app name, and the Deployment section covers previews, production and branch protection.

**CLAUDE.md:** added the Vercel build-command override, Node version, the full `vercel env pull` command plus "never pull Production", the rule for adding new env vars, worktree setup, and the squash-merge, PR template and Dependabot workflow.

### 14. Smaller items and things deliberately *not* recommended

- 📋 **`middleware.ts` → `proxy.ts`** (S): Next 16 deprecated the `middleware` file name and warns at build time. Rename it after the Next upgrade in item 1.
- 📋 **`npm audit` in CI** (S, optional): once item 1 is merged, add a *non-required* CI job running `npm audit --omit=dev --audit-level=critical`. It doesn't belong in the required `ci` check: a new advisory published overnight would block unrelated PRs. Dependabot alerts (item 2) cover most of this anyway.
- **Not recommended — pre-commit hooks (Husky/lint-staged):** CI already enforces the checks, and agents run them. Hooks add setup to every worktree and get skipped with `--no-verify` anyway. Revisit if you often push red builds.
- **Not recommended — required reviews, signed commits, CODEOWNERS:** these exist to coordinate several humans. For a solo repo, the required `ci` check is the right gate.
- **Not recommended yet — staging environment:** Vercel previews plus the Neon `dev` branch already act as staging for each PR.

## What this PR changed

| File | Change |
|---|---|
| `docs/reviews/dev-environment.md` | This review |
| `.nvmrc` | New: `24` |
| `package.json`, `package-lock.json` | Added `"engines": { "node": "24.x" }` (lockfile: only the matching `engines` entry) |
| `.github/workflows/ci.yml` | `setup-node` reads `node-version-file: .nvmrc` instead of a hard-coded `24` |
| `.github/dependabot.yml` | New: weekly grouped npm updates, monthly GitHub Actions updates |
| `.github/pull_request_template.md` | New PR template |
| `.env.example` | New: list of env var names, with notes |
| `.gitignore` | `!.env.example`, so the template can be committed |
| `README.md` | Setup, commands and deployment sections rewritten to match reality |
| `CLAUDE.md` | Build override, Node version, env and worktree sections, PR workflow |

No app code, dependency versions, GitHub settings or Vercel settings were changed.
