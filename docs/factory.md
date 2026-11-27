# Agent factory

How work flows from idea to production, and which agent does what. Role definitions live in `.claude/agents/`; shared rules are in CLAUDE.md ("Agent factory").

## Flow
```
idea ──► issue (owner) ──► [planner: spec + task breakdown, for big features]
     ──► worker (own worktree) ──► PR
     ──► gates: ci check (type-check, lint, test) → reviewer → verifier (UI changes)
     ──► coordinator merges ──► main ──► Vercel production
```

## Roles
| Role | Writes | Tools | Default model | Runs |
|---|---|---|---|---|
| Coordinator | merges, issues | all | Opus, medium | always (session on `main`) |
| Planner | `docs/specs/*` | read + web + docs | Opus, high | once per large feature |
| Worker | code + tests | all, in own worktree | Sonnet (Opus for design-heavy) | one per issue |
| Researcher | `docs/reviews/*`, `docs/research/*` | read + web + docs | Opus, high | spikes, reviews, audits |
| Reviewer | review comments only | read-only | Opus, medium, fresh session | every PR |
| Verifier | pass/fail report | browser + read | Sonnet, medium | PRs that change UI |

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
| `wait-pr.sh <issue>... [--interval S]` | Waits (run in background) until a PR that `Closes #N` has a finished `ci` check. |
| `send.sh <worktree> "<subject>" <file>` | Sends follow-up instructions (e.g. review findings) to the agent in that worktree. |
| `board.sh <number> "<Stage>" ["<Area>"]` | Moves an issue/PR on the **progress board** (https://github.com/users/bgreenlees/projects/1): In progress on dispatch, In review when its PR opens, Waiting on you for owner decisions, Done on merge. |

**Keep the board current** (it's how the owner tracks progress): move cards with `board.sh` at every dispatch, PR, owner decision and merge; owner decisions get an `owner-action` issue so they appear in *Waiting on you*.

**After every batch:** update the Factory state issue (in flight, waiting on owner, next up, decisions), and tick the Roadmap (#18) and the feature's tracking issue.

**New work:** use the "Factory task" issue template (Goal, Scope, Done when, files touched, depends on, role, model, checks). Anything bigger than one PR gets a **planner** spec first.

## Cost controls

Agent time is the factory's main cost, and usage credits can run out mid-task (it happened on 2026-11-26 and killed two workers). These rules keep it in check:

1. **At most 4 agents at once.** `dispatch.sh` refuses a launch when `MAX_AGENTS` (default 4) are already working; queue the rest in the Factory state issue and launch as slots free. `--force` only for something urgent.
2. **Sonnet by default.** Workers, reviewers and verifiers default to Sonnet. Use `--model opus` only for: security-sensitive code (auth, API authorization, data access), design-heavy UI built from a spec, planners and researchers.
3. **Right-size the checks.** A PR under ~150 changed lines that isn't security-sensitive gets **one** check: a Verifier if it changes the UI, otherwise a Reviewer. Bigger or security-sensitive PRs get both. Docs-only PRs get the coordinator's own read.
4. **Fresh coordinator sessions.** The coordinator re-reads its whole conversation every turn, so it is the single biggest cost. Start a new session at least daily, and immediately after any long batch; resume from the Factory state issue (#102).
5. **Coordinator habits:** keep replies short, wait in the background (`wait-pr.sh`), and don't pull large logs or transcripts into the conversation (read just the verdict).
6. **Interrupted work isn't lost:** resume an agent in its existing worktree with `dispatch.sh <issue> <role> --in <worktree>`.
7. **Pace against the owner's plan limits automatically.** `scripts/factory/usage.sh` reads the owner's live usage (5-hour session and weekly) from a one-word Haiku call's `rate_limit_event` (a few hundred tokens, cached for 10 minutes in `~/.claude/state/usage.json`).
   - `dispatch.sh` runs `usage.sh gate` first and refuses a launch when the session is at 70% or more, when the week is more than 15 points ahead of an even pace, or when the numbers can't be read (then ask the owner and use `--force`).
   - Run `scripts/factory/usage.sh watch` in the background while agents work: at 85% it tells every working worker to commit its work in progress, once per window.
   - Start every status update with `scripts/factory/usage.sh` (one line), so the owner never has to send a screenshot.
8. **Check usage:** `agent-usage 1` (per-workspace tokens today) and `/usage` in Claude Code (plan limits).

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
