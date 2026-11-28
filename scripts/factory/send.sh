#!/usr/bin/env bash
# Send follow-up instructions (e.g. review findings) to the agent in a worktree.
#
#   scripts/factory/send.sh <worktree-name> "<subject>" <body-file>
#
# Finds the most recent agent session in that Orca worktree and sends it a
# `dispatch` message. Write the body to a file first (never inline heredocs
# into the orca command).
set -euo pipefail
[ $# -eq 3 ] || { echo "usage: send.sh <worktree-name> \"<subject>\" <body-file>" >&2; exit 2; }
NAME=$1; SUBJECT=$2; BODY=$3
[ -f "$BODY" ] || { echo "send: no such file: $BODY" >&2; exit 2; }
ORCA=${ORCA_CLI_COMMAND:-orca}

# Match on the worktree PATH (the part of worktreeId after "::"), by exact
# basename. The display name ("workspace") can be shared by sibling worktrees
# (worker-167 vs worker-167-2) so it is only a fallback when no path exists.
# If several sessions share the worktree, take the most recently updated one.
SID=$("$ORCA" agent list --json | python3 -c '
import json, sys
name = sys.argv[1].rstrip("/").split("/")[-1]
best = None
for a in json.load(sys.stdin)["result"]["agents"]:
    wid = a.get("worktreeId") or ""
    path = wid.split("::", 1)[1] if "::" in wid else ""
    w = a.get("workspace")
    if not path:
        path = w.get("path", "") if isinstance(w, dict) else str(w or "")
    if path.rstrip("/").split("/")[-1] == name:
        if best is None or a.get("updatedAt", 0) > best.get("updatedAt", 0):
            best = a
if best:
    print(best.get("orcaSessionId"))' "$NAME")
[ -n "$SID" ] || { echo "send: no agent found in worktree '$NAME'" >&2; exit 1; }

"$ORCA" orchestration send --to "orca_session_id:$SID" --type dispatch --subject "$SUBJECT" --body-file "$BODY" --json \
  | python3 -c 'import json,sys; r=json.load(sys.stdin); print("send:", "ok" if r.get("ok") else r)'
