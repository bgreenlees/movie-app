# How the owner can see and test the new-user experience

Issue #191 · 2026-11-28 · researcher

## Summary

**Recommendation: option 2, a staging environment, built as small as possible.** That means a long-lived `staging` git branch whose Vercel *Preview* deployment uses the `dev-clean` database and a test-only sign-in. It's the only option that meets the issue's "Done when": the owner walks the whole new-user path on their phone, repeats it as often as they like, and needs no second real account. Every `anything@example.test` address is a brand-new user. Verifiers get the same thing, and today they can't sign in on a deployed preview at all.

**Do option 3 tonight as a stopgap.** A free second Google account takes five minutes and needs no code. After that it's still the only way to see the real Google screens and the real invite email, which staging can't show. The Profile page already has "Delete Account", so the test account can be made new again.

**Don't build option 1** ("Replay first-run" in production). It looks cheapest but it can't show the new-user experience faithfully. The replay would also overwrite the owner's real ratings (see "Option 1" below).

Option 2 touches sign-in security: the dev-login gate has to be relaxed for one Vercel environment. Per the Trust rules ("never weaken the gates"), that change needs the owner's explicit approval and the security checklist before it merges. The design below keeps it narrow: four independent conditions, none of which can be true in Production.

## What "the new-user path" actually is (observed in code)

| Step | Where it lives | What decides it |
|---|---|---|
| Sign-in page | `app/(auth)/login` | Public. A signed-in user is redirected away from `/login` and `/` to `/search` (`middleware.ts:22`), so the owner has to sign out to see it. |
| First sign-in creates the user | `lib/auth.ts` `jwt()` callback | Finds or creates the row by email; `convertInvites` turns invites for that email into pending connections (`lib/invites.ts`). |
| Onboarding picker | `components/movies/OnboardingModal.tsx`, `app/onboarding/page.tsx` | Shown on `/search` while `User.hasCompletedOnboarding` is false (`app/(main)/search/page.tsx:173`). |
| Picker submit | `POST /api/onboarding` | Upserts each pick as a **WATCHED, 3-star** entry and sets `hasCompletedOnboarding = true` (`app/api/onboarding/route.ts:47-65`). |
| First landing | Discover, What to Watch | Driven by the user's (empty) history, and by the hour of day. |

So "being a new user" is a property of the database rows (flag, watchlist, connections, invites), not of the session. That's why option 1 is hard and why a clean, throwaway user is the natural test.

## Options compared

| | 1. Owner-only "Replay first-run" in prod | 2. Staging (Preview + `dev-clean` + test sign-in) | 3. Second Google account |
|---|---|---|---|
| Meets "Done when" (own phone, repeatable, no second real account) | Partly: picker only | **Yes** | No: needs a second real account (the one thing the issue rules out) |
| Faithful to what a new user sees | No (see below) | **Yes**, same code, a new user each time | **Yes**, plus real Google screens and real invite email |
| Repeatable | Yes | **Yes**, a fresh address per run | Only after "Delete Account" |
| Touches production data/code | **Yes**: new owner-only code path in prod, runs against the owner's real rows | No (separate DB); one gate change in `lib/devLogin.ts` | A test user in the production database |
| New attack surface | Owner identity check and a replay endpoint in prod | A test sign-in on a deployed URL (mitigated below) | None |
| Verifiers can use it | No | **Yes** | No (needs a real Google login) |
| Effort | M | M (4 small tasks) | None, 5 min of owner time |

### Option 1: "Preview as a new user" in production — not recommended

*Observed:*
- **Replaying would overwrite real data.** The onboarding submit does `upsert … update: { rating: 3, status: "WATCHED" }` (`app/api/onboarding/route.ts:56`). Any curated film the owner has already rated would be reset to 3 stars. An honest replay therefore needs a **dry-run mode that never calls this endpoint**. The picker would be a cosmetic copy, not the real flow.
- **The first landing can't be replayed without faking the owner's data as empty.** What the new user sees on `/search` and What to Watch comes from queries on their rows. A "pretend I'm empty" switch would have to be threaded through every page and API. That is invasive, hard to keep in sync, and a place for bugs that expose or hide real data.
- **It needs an "owner" concept that doesn't exist.** Today every user is equal. Gating by email means a new env var and a new privileged path in Production, the one place we want less attack surface.
- The sign-in page is already visible to the owner in a private window (signed out). Invites need a second address anyway. So option 1 would only really add the picker.

*Verdict:* high cost for partial coverage, in the riskiest environment. Rejected.

### Option 2: staging — recommended

*What exists today (observed):*
- Preview and Development already use `dev-clean`: schema-only, test accounts only (CLAUDE.md "Database").
- Dev login is off on Preview on purpose. `lib/devLogin.ts` requires `NODE_ENV !== "production"` **and** `VERCEL_ENV` not `preview`/`production` **and** `DEV_LOGIN === "1"`. Vercel builds run with `NODE_ENV=production`, so a Preview can never have it (`.claude/agents/verifier.md:22` says the same).
- So today nobody, owner or Verifier, can sign in on a deployed preview. Signed-in checks are local only, and a phone can't reach a localhost server (CLAUDE.md requires `-H 127.0.0.1`).

*Proposed design (a suggestion, not yet built or tested):*
1. `staging` is a normal git branch. Pushing it makes Vercel build a Preview with a stable branch URL.
2. The test sign-in turns on only when **all** of these are true: `VERCEL_ENV === "preview"`, `VERCEL_GIT_COMMIT_REF === "staging"`, `STAGING_LOGIN === "1"`, and `DATABASE_URL` is not the production host (reuse the check in `e2e/global-teardown.ts:9`). The env var `STAGING_LOGIN` is set in Vercel for Preview, branch `staging` only. Only `@example.test` addresses are accepted, as now, so it can't impersonate a real person.
3. In Production none of the conditions can hold (`VERCEL_ENV` is `production`), so a mistyped env var there still does nothing. Keep the existing unit tests and add tests for each condition being false on its own.
4. Turn on Vercel Authentication (Deployment Protection) for the staging URL, so only people logged in to the Vercel team can reach it, and the owner's phone is logged in once. **Not verified:** whether it's already on for this project. Check in Vercel project settings, or use the `vercel:access-protected-vercel-deployment` skill.
5. **No email sending on staging.** `lib/invites.ts` sends real email through Resend when `RESEND_API_KEY` and `EMAIL_FROM` are set, so a reachable test sign-in plus a Resend key is a spam relay. Confirm the Preview env has **no** `RESEND_API_KEY`. The invite then records but doesn't send (`lib/invites.ts`, "invite recorded but not emailed"), and that's fine for testing: invite `b@example.test`, then sign in as `b@example.test` and the pending connection appears.
6. A small script `scripts/factory/staging.sh <ref>` pushes any ref (`main`, or a PR branch) to `staging`. That lets the owner test a PR's new-user flow before merging, and lets Verifiers check signed-in behaviour on a real deployment.
7. Cleanup: a script that deletes `@example.test` users (and cascades) from `dev-clean`, run now and then.

*Walkthrough for the owner (once built):* push → open the staging URL on the phone → "Dev login" → type `ann1@example.test` → full first-run (picker, first landing). To repeat, use `ann2@example.test`. No deletion needed.

*What staging cannot show:* the real Google account chooser and the invite email as delivered. Option 3 covers those occasionally.

*Risks to review (suspected, not tested):*
- Relaxing `NODE_ENV` is the part of the gate that matters, because Preview runs with `NODE_ENV=production`. The branch + env-var + non-production-DB conditions are what replace it. The security reviewer should confirm that no other branch name or fork PR can satisfy them. Forks don't get Preview env vars without approval, and the repo is public.
- `staging` must not be a protected-branch exception that lets unreviewed code reach Production. It only deploys a Preview; Production deploys from `main`.
- Vercel *custom environments* would be a cleaner boundary than a branch, but they may need a paid plan and I haven't checked what `VERCEL_ENV` reports for them. Not needed for this design.

### Option 3: second Google account — stopgap and occasional real check

*Observed/known:* Google sign-in creates the user on first use (`lib/auth.ts`), so a second account is a perfect new user, including the real OAuth screens. The Profile page can delete the account (`app/(main)/profile/page.tsx`, "Delete Account"), so it can be made new again.

*Downsides:* the issue rules out needing a second real account, the account has to be managed, and it adds a test user to the production database with its watchlist rows. Repeating means deleting and re-creating, with Google possibly asking for re-consent. Verifiers can't use it. It's still the right thing to do **tonight**, because it's free and shows what option 2 can't.

## Findings, ranked

1. **No signed-in testing exists on any deployed environment (High, M).** Not just for the owner: Verifiers also can't check signed-in UI on a preview (`verifier.md:22`). *Why it matters:* the new-user path is the first thing every real user sees, and it has been broken before (#176 audit: phone picker, "Welcome back" for new users). *Fix:* option 2.
2. **Replaying first-run in production would destroy data (High if built, S to avoid).** Evidence: `app/api/onboarding/route.ts:56`. *Fix:* don't build option 1.
3. **A reachable test sign-in plus a Resend key would be a spam relay (Medium, S).** Evidence: `lib/invites.ts` sends whenever the keys exist. *Fix:* no Resend key on Preview, confirmed as a follow-up check.
4. **Gate relaxation needs a security review (Medium, S).** Evidence: `lib/devLogin.ts` header. *Fix:* design above, owner approves, reviewer runs the security checklist.

## Proposed follow-ups

For the owner to approve. I haven't created issues.

1. **Today (owner, no code): make a free second Google account for real-Google checks.** Done when the owner has signed in to production with it and walked the picker on their phone. Delete it from Profile when done to repeat.
2. **Add the staging test sign-in gate (security-sensitive).** Done when: `lib/devLogin.ts` (or a sibling) enables the test sign-in only when all four conditions above hold; unit tests cover each condition being false alone, and Production, a PR preview and a missing `STAGING_LOGIN` all stay closed; the `/security-review` checklist is attached to the PR; CLAUDE.md's Dev login section describes the new gate.
3. **Set up the Vercel side.** Done when: `STAGING_LOGIN=1` exists for Preview + branch `staging` only; Preview has no `RESEND_API_KEY`; Deployment Protection is on for the staging URL; the staging URL is listed in `docs/factory.md`; `.env.example` mentions `STAGING_LOGIN`. (Owner or ops; some steps need the owner's Vercel login.)
4. **`scripts/factory/staging.sh` and the `docs/factory.md` section.** Done when: the script pushes a given ref to `staging`, the doc has the owner's phone walkthrough and the Verifier's steps (replace the "previews have no dev login" line in `verifier.md`), and the issue's "documented in `docs/factory.md`" requirement is met.
5. **`@example.test` cleanup script for `dev-clean`.** Done when: it refuses the production host, deletes users with that domain and their rows, and prints a count of 0 remaining.

Tasks 2 and 3 can be done in either order, but the owner should approve the design before 2 starts.
