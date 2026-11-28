# Agent factory

How work flows from idea to production, and which agent does what. Role definitions live in `.claude/agents/`; shared rules are in CLAUDE.md ("Agent factory").

## Flow
```
idea ──► issue (owner) ──► [planner: spec + task breakdown, for big features]
     ──► [designer: mockups from real screenshots, for new or redesigned screens]
     ──► worker (own worktree) ──► PR
     ──► gates: ci + e2e checks (type-check, lint, test, smoke tests) → reviewer → verifier (new UI only)
     ──► coordinator merges ──► main ──► Vercel production
```

## Roles
| Role | Writes | Tools | Default model | Runs |
|---|---|---|---|---|
| Coordinator | merges, issues | all | Opus, medium | always (session on `main`) |
| Planner | `docs/specs/*` | read + web + docs | Opus, high | once per large feature |
| Worker | code + tests | all, in own worktree | Sonnet (Opus for design-heavy) | one per issue |
| Researcher | `docs/reviews/*`, `docs/research/*` | read + web + docs | Opus, high | spikes, reviews, audits |
| Designer | `docs/design/<issue>-<slug>/*` (screenshots, prototype, spec) | read + shell (Playwright) + write docs, never app code | Opus | one per mockup or redesign issue |
| Reviewer | review comments only | read-only | Opus, medium, fresh session | every PR |
| Verifier | pass/fail report | browser + read | Sonnet, medium | PRs that change UI |

**No design by the coordinator** (owner rule, 2026-11-28). Beyond minor layout, every mockup or screen redesign goes to a **designer** agent (`dispatch.sh <n> designer`). The designer starts from real screenshots of today's screens (Playwright at 390px and 1280px), keeps the Cinema dark design system, changes only what the issue asks, and hands a worker a spec to build from. If the budget is short, queue the design issue; don't draw it yourself.

Escalate: start at the default, and relaunch at higher effort or on Opus after a failed attempt. Stop and ask the owner after 3.

## Coordinator runbook

The coordinator is the long-lived session on `main`. It's also the most expensive one, because it re-reads its whole conversation every turn. So **start a fresh coordinator session every day or two** (or whenever it feels slow). Nothing is lost, because the state lives in GitHub.

**Resuming (fresh session):**
1. Read CLAUDE.md and this file.
2. Read the pinned **Factory state** issue (#102): what's in flight, what's waiting on the owner, what's next, the decisions log and gotchas.
3. Check reality against it: `gh pr list`, `git worktree list`, `orca agent list --json`. Then carry on.

**Day-to-day commands** (`scripts/factory/`):
| Command | What it does |
|---|---|
| `dispatch.sh <issue> <role> [--model M] [--pr N] [--note T] [--dry-run]` | Builds the standard brief (role file + issue + safety rules + other open PRs), picks a per-issue port (3200 + issue % 700) and launches the agent in its own Orca worktree. With `--pr N` it checks out the PR head first. |
| `wait-pr.sh <issue>... [--interval S]` | Waits (run in background) until **every** listed issue has an open PR that `Closes #N` with a finished `ci` check; prints one line per issue as each finishes. |
| `send.sh <worktree> "<subject>" <file>` | Sends follow-up instructions (e.g. review findings) to the agent in that worktree. `<worktree>` is the exact folder name (matched by path, so `worker-167` never hits `worker-167-2`). |
| `board.sh <number> "<Stage>" ["<Area>"]` | Moves an issue/PR on the **progress board** (https://github.com/users/bgreenlees/projects/1): In progress on dispatch, In review when its PR opens, Waiting on you for owner decisions, Done on merge. |

**Keep the board current** (it's how the owner tracks progress): move cards with `board.sh` at every dispatch, PR, owner decision and merge; owner decisions get an `owner-action` issue so they appear in *Waiting on you*.

**After every batch:** update the Factory state issue (in flight, waiting on owner, next up, decisions), and tick the Roadmap (#18) and the feature's tracking issue.

**New work:** use the "Factory task" issue template (Goal, Scope, Done when, files touched, depends on, role, model, checks). Anything bigger than one PR gets a **planner** spec first.

## Cost controls

Agent time is the factory's main cost, and usage credits can run out mid-task (it happened on 2026-11-26 and killed two workers). These rules keep it in check:

1. **At most 4 agents at once.** `dispatch.sh` refuses a launch when `MAX_AGENTS` (default 4) are already working; queue the rest in the Factory state issue and launch as slots free. `--force` only for something urgent.
2. **Sonnet by default.** Workers, reviewers and verifiers default to Sonnet (designers, planners and researchers default to Opus). Use `--model opus` only for: security-sensitive code (auth, API authorization, data access), design-heavy UI built from a spec, designers, planners and researchers. **At most one Opus agent at a time** (`MAX_OPUS`, default 1): on the Pro plan two Opus workers in parallel used about a third of a 5-hour session window in 30 minutes. `dispatch.sh` records each launch's model and refuses a second Opus launch; queue it or run it on Sonnet.
3. **Right-size the checks.** A PR under ~150 changed lines that isn't security-sensitive gets **one** check: a Verifier if it changes the UI, otherwise a Reviewer. Bigger or security-sensitive PRs get both. Docs-only PRs get the coordinator's own read.
4. **Fresh coordinator sessions.** The coordinator re-reads its whole conversation every turn, so it is the single biggest cost. Start a new session at least daily, and immediately after any long batch; resume from the Factory state issue (#102).
5. **Coordinator habits:** keep replies short, wait in the background (`wait-pr.sh`), and don't pull large logs or transcripts into the conversation (read just the verdict).
6. **Interrupted work isn't lost:** resume an agent in its existing worktree with `dispatch.sh <issue> <role> --in <worktree>`.
7. **Pace against the owner's plan limits automatically.** `scripts/factory/usage.sh` reads the owner's live usage (5-hour session and weekly) from a one-word Haiku call's `rate_limit_event` (a few hundred tokens, cached for 10 minutes in `~/.claude/state/usage.json`).
   - `dispatch.sh` runs `usage.sh gate` first and refuses a launch when the session would pass 95% once this launch's typical cost is added (owner decision 2026-11-27: 70% stalled work with ~20% left; checking only the current number then let three launches at 82% run the session to 100%). The reserve is the new agent's typical cost (Opus worker ~15%, Sonnet ~5%; `USAGE_COST_OPUS` / `USAGE_COST_SONNET`) plus half the cost of each agent already working. So late in a window an Opus launch waits for the reset while cheaper Sonnet work still goes. It also refuses when the week is more than 15 points ahead of an even pace, or when the numbers can't be read (then ask the owner and use `--force`).
   - Run `scripts/factory/usage.sh watch` in the background while agents work: at 85% it tells every working worker to commit its work in progress, once per window.
   - Start every status update with `scripts/factory/usage.sh` (one line), so the owner never has to send a screenshot.
8. **Check usage:** `agent-usage 1` (per-workspace tokens today) and `/usage` in Claude Code (plan limits).

## Smoke tests and when a Verifier is still needed

`npm run e2e` (Playwright, `e2e/`) and the `e2e` CI job sign in with the dev login and click through the core flows in a real browser: login redirect, Discover, add to My Movies, What to Watch, and Watch Together picks for two connected friends. It takes about 10 seconds locally and runs on every PR, so a broken core flow fails the PR with no agent involved.

- It runs against `next dev` (dev login is off under `next start` by design), a fake TMDB (`e2e/tmdb-stub.mjs`, no TMDB key needed) and a throwaway Postgres in CI. Locally it uses `DATABASE_URL` from `.env.local` (the dev database) and deletes its `e2e-*@example.test` users afterwards. It refuses to run against the production host.
- **A Verifier is no longer needed to re-check the core flows above.** Verifiers only check what the smoke tests can't: a **new or changed screen** the tests don't cover, visual design and layout (spacing, mobile, dark/light), and anything depending on real TMDB data, real streaming services or Google sign-in.
- **A PR that adds or changes a core flow must update the smoke tests in the same PR.** A smoke-test failure is a real regression until proven otherwise: fix the app, don't loosen the test.
- Keep it small: smoke tests check "does it work end to end". Logic edge cases belong in Vitest.
- Branch protection currently requires only `ci`. The owner should also mark `e2e` as a required check (Settings → Branches), or the gate is advisory.

## Security layers
1. **Automated** (GitHub): secret scanning + push protection, Dependabot alerts + security updates, CodeQL, and the `ci` check required by branch protection (enforced for admins).
2. **Every PR**: the Reviewer's security checklist, plus `/security-review` when a PR touches auth, API routes, Prisma or env handling.
3. **Periodic**: a Researcher-run security audit of the whole app, and again before major launches (e.g. the iOS app).

## Sources this is adapted from
- Claude Code subagents: https://claude.com/blog/how-and-when-to-use-subagents-in-claude-code
- BMAD Method (separate planning and QA roles): https://github.com/bmad-code-org/BMAD-METHOD
- GitHub Spec Kit (spec → plan → tasks → implement): https://github.github.com/spec-kit/
- Subagent practices (read-only reviewers, "done = QA green", capped retries): https://www.pubnub.com/blog/best-practices-claude-code-subagents-part-two-from-prompts-to-pipelines/
- claude-code-action (automated PR review in CI): https://docs.claude.com/en/docs/claude-code/github-actions
