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

**After every batch:** update the Factory state issue (in flight, waiting on owner, next up, decisions), and tick the Roadmap (#18) and the feature's tracking issue.

**New work:** use the "Factory task" issue template (Goal, Scope, Done when, files touched, depends on, role, model, checks). Anything bigger than one PR gets a **planner** spec first.

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
