#!/usr/bin/env bash
# Wait until EVERY given issue has an open PR whose `ci` check has finished.
#
#   scripts/factory/wait-pr.sh <issue> [<issue>...] [--interval SECONDS]
#
# Matches PRs by "Closes #N" in the PR body, not by branch name (workers pick
# their own branch names). Prints "issue=<N> pr=<M> ci=<pass|fail>" as each one
# finishes, and exits 0 only once all of them have. Run it in the background;
# it never times out on its own.
set -euo pipefail

ISSUES=(); INTERVAL=60
while [ $# -gt 0 ]; do
  case $1 in
    --interval) INTERVAL=$2; shift 2 ;;
    *) [[ $1 =~ ^[0-9]+$ ]] || { echo "wait-pr: not an issue number: $1" >&2; exit 2; }; ISSUES+=("$1"); shift ;;
  esac
done
[ ${#ISSUES[@]} -gt 0 ] || { echo "usage: wait-pr.sh <issue>... [--interval S]" >&2; exit 2; }

DONE=" "  # space-separated issues already reported
while :; do
  for i in "${ISSUES[@]}"; do
    [[ $DONE == *" $i "* ]] && continue
    pr=$(gh pr list --state open --json number,body \
      -q ".[] | select(.body | test(\"(?i)(closes|fixes|resolves) #$i\\\\b\")) | .number" | head -1)
    [ -n "$pr" ] || continue
    ci=$(gh pr checks "$pr" 2>/dev/null | awk '$1=="ci"{print $2}' || true)  # gh exits 8 while checks are pending
    if [ "$ci" = pass ] || [ "$ci" = fail ]; then
      echo "issue=$i pr=$pr ci=$ci"
      DONE="$DONE$i "
    fi
  done
  all=1
  for i in "${ISSUES[@]}"; do [[ $DONE == *" $i "* ]] || all=0; done
  [ $all = 1 ] && exit 0
  sleep "$INTERVAL"
done
