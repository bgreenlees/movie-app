#!/usr/bin/env bash
# Launch one factory agent on one GitHub issue, in its own Orca worktree.
#
#   scripts/factory/dispatch.sh <issue> <role> [--model opus|sonnet] [--pr N] [--note "text"] [--dry-run]
#
#   role     planner | worker | researcher | reviewer | verifier  (.claude/agents/<role>.md)
#   --pr N   reviewer/verifier: check the worktree out at PR N's head before the agent starts
#            (Orca's own `--pr` flag links the PR but does NOT check it out)
#   --model  overrides the role file's default model
#   --note   extra instructions appended to the brief
#   --dry-run  print the brief and the launch plan, launch nothing
#   --in NAME  resume in an EXISTING worktree (e.g. after an interruption) instead of creating one
#   --force    launch even if MAX_AGENTS are already working (default cap: 4)
#
# Cost controls (see docs/factory.md "Cost controls"): at most MAX_AGENTS (env, default 4)
# agents run at once; the default model comes from the role file (Sonnet except planner/researcher);
# pass --model opus only for security-sensitive or design-heavy work.
#
# Why a script: every launch gets the same brief, port, safety rules and naming,
# so the coordinator doesn't hand-assemble them (and repeat mistakes).
set -euo pipefail

die() { echo "dispatch: $*" >&2; exit 1; }
[ $# -ge 2 ] || die "usage: dispatch.sh <issue> <role> [--model M] [--pr N] [--note TEXT] [--dry-run]"

ISSUE=$1; ROLE=$2; shift 2
MODEL=""; PR=""; NOTE=""; DRY=0; IN=""; FORCE=0
while [ $# -gt 0 ]; do
  case $1 in
    --model) MODEL=$2; shift 2 ;;
    --pr) PR=$2; shift 2 ;;
    --note) NOTE=$2; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    --in) IN=$2; shift 2 ;;
    --force) FORCE=1; shift ;;
    *) die "unknown option: $1" ;;
  esac
done
[[ $ISSUE =~ ^[0-9]+$ ]] || die "issue must be a number"
[ -z "$PR" ] || [[ $PR =~ ^[0-9]+$ ]] || die "--pr must be a number"

ROOT=$(git rev-parse --show-toplevel)
ROLE_FILE="$ROOT/.claude/agents/$ROLE.md"
[ -f "$ROLE_FILE" ] || die "no role file: .claude/agents/$ROLE.md"
[ -n "$MODEL" ] || MODEL=$(sed -n 's/^model: *//p' "$ROLE_FILE" | head -1)
[ -n "$MODEL" ] || MODEL=sonnet
ORCA=${ORCA_CLI_COMMAND:-orca}

# --- Cost control: cap concurrent agents ---------------------------------
MAX_AGENTS=${MAX_AGENTS:-4}
WORKING=$("$ORCA" agent list --json 2>/dev/null | python3 -c '
import json, sys
try: agents = json.load(sys.stdin)["result"]["agents"]
except Exception: print(0); sys.exit()
def name(a):
    w = a.get("workspace"); p = w.get("path", "") if isinstance(w, dict) else str(w)
    return p.rstrip("/").split("/")[-1]
print(sum(1 for a in agents if a.get("state") == "working" and name(a) not in ("movie-app", "main")))')
if [ "$DRY" -eq 0 ] && [ "$FORCE" -eq 0 ] && [ "${WORKING:-0}" -ge "$MAX_AGENTS" ]; then
  die "$WORKING agents already working (cap MAX_AGENTS=$MAX_AGENTS). Wait for one to finish, or pass --force."
fi

# Deterministic per-issue port, away from the default 3000; reviewers/verifiers get +1.
PORT=$((3200 + ISSUE % 700))
case $ROLE in reviewer|verifier) PORT=$((PORT + 1)) ;; esac

NAME=${IN:-"$ROLE-$ISSUE${PR:+-pr$PR}"}
TITLE=$(gh issue view "$ISSUE" --json title -q .title) || die "can't read issue #$ISSUE"
OPEN_PRS=$(gh pr list --state open --json number,title -q '.[]|"- #\(.number) \(.title)"' | head -15)

# Briefs never live in the repo (a stray brief once landed in the working tree).
BRIEF_DIR="${TMPDIR:-/tmp}/factory-briefs"; mkdir -p "$BRIEF_DIR"
BRIEF="$BRIEF_DIR/$NAME.md"

{
  echo "You are acting as the **$ROLE** role. Read \`.claude/agents/$ROLE.md\` and CLAUDE.md (including the Trust rules) first, and follow them exactly."
  echo
  echo "**Task:** GitHub issue #$ISSUE, \"$TITLE\" (\`gh issue view $ISSUE\`). Read it fully, including any spec it links, before starting."
  if [ -n "$PR" ]; then
    echo
    echo "**Subject:** PR #$PR. This worktree has been checked out at the PR head. First confirm \`git rev-parse HEAD\` equals \`gh pr view $PR --json headRefOid -q .headRefOid\`; stop and say so if not."
  fi
  echo
  echo "## Standard rules for this run"
  echo "- Run \`npm install\` (\`npm ci\` for reviewers and verifiers) first. Prisma client: \`DATABASE_URL=postgresql://x@localhost/x npx prisma generate\`."
  echo "- If you run the app: use **only port $PORT**, start it with \`npm run dev -- -p $PORT -H 127.0.0.1\`, and stop only your own PID (never a broad \`pkill\`)."
  echo "- Signed-in checks: the dev login (\`DEV_LOGIN=1\` in your \`.env.local\`, \`<name>@example.test\` users; see CLAUDE.md). Use an isolated browser profile. Never print cookie, token or secret values. Delete your test users and rows afterwards, and confirm 0 remain."
  echo "- Never touch production. Never run \`npm run build\`, migrations or \`prisma db push\` unless the issue explicitly allows it (and then only against the dev host \`ep-royal-tooth\`)."
  case $ROLE in
    worker)
      echo "- Fresh branch off \`main\`. Stay inside the issue's files; other agents are working in parallel."
      echo "- \`npx tsc --noEmit\`, \`npm run lint\` and \`npm test\` must pass. For auth, API or data-access changes, run \`/security-review\` on your diff and summarise it in the PR."
      echo "- Open a **ready** (not draft) PR whose body contains \`Closes #$ISSUE\`, explains *why*, and has a \"how to verify\" section. Wait for \`gh pr checks --watch\` to go green. **Do not merge.** Finish by printing the PR URL." ;;
    planner|researcher)
      echo "- Docs only. Open a **ready** PR (body contains \`Refs #$ISSUE\`, or \`Closes #$ISSUE\` if the issue is the doc itself). Wait for CI. Do not merge. Do not create issues: propose them in the PR body." ;;
    reviewer|verifier)
      echo "- You are read-only on the repo: no commits, pushes, merges or PR approvals. Report findings in your final reply (most severe first, with file:line or repro steps), ending with an overall verdict." ;;
  esac
  echo
  echo "## Other open PRs (avoid their files)"
  echo "${OPEN_PRS:-none}"
  if [ -n "$NOTE" ]; then echo; echo "## Coordinator notes"; echo "$NOTE"; fi
} > "$BRIEF"

echo "dispatch: $NAME  model=$MODEL  port=$PORT  agents-working=${WORKING:-0}/$MAX_AGENTS  brief=$BRIEF"
if [ $DRY -eq 1 ]; then echo "----- brief -----"; cat "$BRIEF"; exit 0; fi

if [ -n "$IN" ]; then
  WT=$(git worktree list --porcelain | awk '/^worktree /{print $2}' | grep -E "/$IN\$" | head -1)
  [ -n "$WT" ] || die "no existing worktree named $IN"
  printf '\n## Resuming\nA previous agent in this worktree was interrupted. Inspect `git status` / `git log` and any uncommitted work first, and continue from it rather than starting over.\n' >> "$BRIEF"
  "$ORCA" agent launch --agent claude --model "$MODEL" --worktree "path:$WT" --prompt "$(cat "$BRIEF")" --json \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("dispatch: resumed in", sys.argv[1], (r.get("outcome") or {}).get("kind", "?"))' "$WT"
elif [ -n "$PR" ]; then
  # Create the worktree without an agent, check out the PR head, then launch the agent.
  OUT=$("$ORCA" worktree create --name "$NAME" --no-parent --json)
  WT=$(printf '%s' "$OUT" | python3 -c 'import json,sys; d=json.load(sys.stdin)["result"]; w=d.get("worktree",d); print(w["path"])')
  git -C "$WT" fetch -q origin "pull/$PR/head"
  git -C "$WT" checkout -q --detach FETCH_HEAD
  "$ORCA" agent launch --agent claude --model "$MODEL" --worktree "path:$WT" --prompt "$(cat "$BRIEF")" --json \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("dispatch: launched", (r.get("outcome") or {}).get("kind", "?"))'
else
  "$ORCA" worktree create --name "$NAME" --no-parent --agent claude --model "$MODEL" --prompt "$(cat "$BRIEF")" --json \
    | python3 -c 'import json,sys; r=json.load(sys.stdin)["result"]; print("dispatch: launched in", r["worktree"]["path"])'
fi
