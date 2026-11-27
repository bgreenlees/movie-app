#!/usr/bin/env bash
# Reads the owner's Claude plan usage so the factory can pace itself.
#
#   scripts/factory/usage.sh          one line: session % (reset time) · week % (reset time)
#   scripts/factory/usage.sh gate [N] exit 0 if a new agent may launch, else 1 with the reason;
#                                     N = session % to reserve for it (dispatch.sh passes the
#                                     launch's typical cost plus half of what's already running)
#   scripts/factory/usage.sh watch    loop: at USAGE_WIP_AT % of the session, tell every working
#                                     agent to commit its work in progress (once per window)
#
#   scripts/factory/usage.sh refresh  fetch fresh numbers now
#
# Source: a one-word Haiku call (`claude -p --output-format stream-json`), whose
# `rate_limit_event` carries the plan's 5-hour and weekly utilization. It costs a few hundred
# tokens and runs at most every USAGE_STALE_MIN minutes; the result is cached in
# ~/.claude/state/usage.json. If it can't be read, `gate` refuses: ask the owner, then --force.
#
# Thresholds (env): USAGE_LAUNCH_MAX (default 95) session % above which nothing new launches;
# a launch is refused when session % + N would pass USAGE_LAUNCH_MAX;
# USAGE_WIP_AT (default 85) session % at which running agents are told to commit;
# USAGE_WEEK_SLACK (default 15) how many points the week may run ahead of an even pace;
# USAGE_STALE_MIN (default 10) minutes after which the cached numbers are refreshed.
set -euo pipefail

USAGE_FILE=${USAGE_FILE:-$HOME/.claude/state/usage.json}
export USAGE_FILE USAGE_LAUNCH_MAX=${USAGE_LAUNCH_MAX:-95} USAGE_WIP_AT=${USAGE_WIP_AT:-85} \
  USAGE_WEEK_SLACK=${USAGE_WEEK_SLACK:-15} USAGE_STALE_MIN=${USAGE_STALE_MIN:-10}

# Prints "<mode-result>\t<message>"; mode is line | gate | session.
read_usage() {
  USAGE_RESERVE=${2:-0} python3 -I - "$1" <<'PY'
import json, os, sys, time
from datetime import datetime, timezone
mode = sys.argv[1]
now = time.time()
def ts(v):
    if v is None: return None
    if isinstance(v, (int, float)): return v / 1000 if v > 1e11 else v
    try: return datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp()
    except ValueError: return None
def fmt(t):
    if t is None: return "?"
    d = datetime.fromtimestamp(t)
    return d.strftime("%-I:%M %p") if t - now < 20 * 3600 else d.strftime("%a %-I:%M %p")
try:
    data = json.load(open(os.environ["USAGE_FILE"]))
except (OSError, ValueError):
    print("unknown\tno usage data (usage.sh refresh failed)"); sys.exit()
age_min = (now - data.get("saved_at", 0)) / 60
rl = data.get("rate_limits") or {}
def window(key):
    w = rl.get(key) or {}
    pct, reset = w.get("used_percentage", w.get("utilization")), ts(w.get("resets_at"))
    if reset is not None and reset <= now: pct = 0  # the window has reset since we saved it
    return (None if pct is None else float(pct)), reset
s_pct, s_reset = window("five_hour")
w_pct, w_reset = window("seven_day")
line = (f"session {s_pct:.0f}% (resets {fmt(s_reset)})" if s_pct is not None else "session ?") + \
       " · " + (f"week {w_pct:.0f}% (resets {fmt(w_reset)})" if w_pct is not None else "week ?") + \
       f" · {age_min:.0f}m ago"
if mode == "line": print(f"ok\t{line}"); sys.exit()
if mode == "session":
    print(f"{'unknown' if s_pct is None or age_min > float(os.environ['USAGE_STALE_MIN']) else round(s_pct)}\t{line}"); sys.exit()
# gate
if age_min > float(os.environ["USAGE_STALE_MIN"]) or s_pct is None:
    print(f"refuse\tusage data is stale or missing ({line}); ask the owner, then --force"); sys.exit()
reserve = float(os.environ.get("USAGE_RESERVE") or 0)
if s_pct + reserve >= float(os.environ["USAGE_LAUNCH_MAX"]):
    need = f" + {reserve:.0f}% for this launch" if reserve else ""
    print(f"refuse\tsession at {s_pct:.0f}%{need} would pass the {os.environ['USAGE_LAUNCH_MAX']}% limit; wait for the reset at {fmt(s_reset)}, or launch something cheaper"); sys.exit()
if w_pct is not None and w_reset is not None:
    elapsed = max(0.0, min(1.0, 1 - (w_reset - now) / (7 * 86400)))
    allowed = min(95.0, elapsed * 100 + float(os.environ["USAGE_WEEK_SLACK"]))
    if w_pct > allowed:
        print(f"refuse\tweek at {w_pct:.0f}%, ahead of pace (allowed {allowed:.0f}% at this point); slow down until {fmt(w_reset)}"); sys.exit()
print(f"ok\t{line}")
PY
}

# Fetch fresh numbers with a tiny Haiku call and cache them (same shape the reader expects).
refresh() {
  mkdir -p "$(dirname "$USAGE_FILE")"
  (cd "${TMPDIR:-/tmp}" && claude -p "Reply with the single word ok." --model haiku \
      --output-format stream-json --verbose --max-turns 1 2>/dev/null) | python3 -I -c '
import json, os, sys, time
for line in sys.stdin:
    try: d = json.loads(line)
    except ValueError: continue
    if d.get("type") != "rate_limit_event": continue
    w = (d.get("rate_limit_info") or {}).get("unifiedWindows") or {}
    out = {k: {"used_percentage": round(float(v.get("utilization", 0)) * 100, 1), "resets_at": v.get("resetsAt")}
           for k, v in w.items() if k in ("five_hour", "seven_day")}
    if out:
        p = sys.argv[1]; t = p + ".tmp"
        with open(t, "w") as f: json.dump({"rate_limits": out, "saved_at": int(time.time())}, f)
        os.replace(t, p); sys.exit(0)
sys.exit(1)' "$USAGE_FILE"
}
# Refresh when the cache is missing or older than USAGE_STALE_MIN.
ensure_fresh() {
  local age=999999
  [ -f "$USAGE_FILE" ] && age=$(( $(date +%s) - $(stat -f %m "$USAGE_FILE" 2>/dev/null || stat -c %Y "$USAGE_FILE") ))
  [ "$age" -lt $(( USAGE_STALE_MIN * 60 )) ] || refresh || true
}

cmd=${1:-line}
case $cmd in line|gate|watch) [ "$cmd" = watch ] || ensure_fresh ;; esac
case $cmd in
  line)
    out=$(read_usage line); echo "Usage: ${out#*	}" ;;
  gate)
    [[ ${2:-0} =~ ^[0-9]+$ ]] || { echo "usage: usage.sh gate [reserve-percent]" >&2; exit 2; }
    out=$(read_usage gate "${2:-0}"); verdict=${out%%	*}; msg=${out#*	}
    if [ "$verdict" = ok ]; then echo "usage: $msg"; exit 0; fi
    echo "usage: $msg" >&2; exit 1 ;;
  watch)
    DIR=$(cd "$(dirname "$0")" && pwd); warned_reset=
    while :; do
      ensure_fresh
      out=$(read_usage session); pct=${out%%	*}
      if [[ $pct =~ ^[0-9]+$ ]] && [ "$pct" -ge "$USAGE_WIP_AT" ]; then
        reset=$(python3 -I -c 'import json,sys; print((json.load(open(sys.argv[1])).get("rate_limits") or {}).get("five_hour",{}).get("resets_at",""))' "$USAGE_FILE" 2>/dev/null || true)
        if [ "$reset" != "$warned_reset" ]; then
          warned_reset=$reset
          body=$(mktemp "${TMPDIR:-/tmp}/usage-wip.XXXXXX")
          printf 'Usage is at %s%% of the 5-hour session limit. Commit your work in progress now (a WIP: message is fine) so it survives a cutoff, then carry on. If you are cut off you will be resumed in this worktree after the reset.\n' "$pct" > "$body"
          for wt in $(${ORCA_CLI_COMMAND:-orca} agent list --json | python3 -I -c '
import json, sys
for a in json.load(sys.stdin)["result"]["agents"]:
    w = a.get("worktreeId", "").rstrip("/").split("/")[-1]
    if a.get("state") == "working" and w.split("-")[0] in ("worker", "planner", "researcher"): print(w)'); do
            "$DIR/send.sh" "$wt" "Commit WIP now: usage ${pct}%" "$body" || true
          done
          rm -f "$body"; echo "watch: told working agents to commit at ${pct}%"
        fi
      fi
      sleep "${USAGE_WATCH_INTERVAL:-120}"
    done ;;
  refresh)
    refresh && read_usage line | cut -f2- ;;
  *) echo "usage: usage.sh [line|gate|watch|refresh]" >&2; exit 2 ;;
esac
