#!/usr/bin/env bash
# Move an issue or PR on the progress board (adds it if it isn't there yet).
#
#   scripts/factory/board.sh <issue|pr number> "<Stage>" ["<Area>"]
#
#   Stage: Backlog | Up next | In progress | In review | Waiting on you | Done
#   Area:  Watch Together | Redesign | Factory | Security | App | Dependencies | iOS / TV
#
# Board: https://github.com/users/bgreenlees/projects/1 (needs the gh `project` scope).
# The coordinator calls this on every dispatch (In progress), PR open (In review),
# owner decision needed (Waiting on you) and merge (Done).
set -euo pipefail
[ $# -ge 2 ] || { echo "usage: board.sh <number> \"<Stage>\" [\"<Area>\"]" >&2; exit 2; }
N=$1; STAGE=$2; AREA=${3:-}
OWNER=bgreenlees; PNUM=1; REPO=bgreenlees/movie-app
KIND=issues; gh pr view "$N" --repo "$REPO" >/dev/null 2>&1 && ! gh issue view "$N" --repo "$REPO" --json isPinned >/dev/null 2>&1 && KIND=pull
URL="https://github.com/$REPO/$KIND/$N"
python3 - "$URL" "$STAGE" "$AREA" "$OWNER" "$PNUM" <<'PY'
import json, subprocess, sys
url, stage, area, owner, pnum = sys.argv[1:]
gh = lambda *a: subprocess.run(['gh', *a], capture_output=True, text=True, check=True).stdout
proj = json.loads(gh('project', 'view', pnum, '--owner', owner, '--format', 'json'))
fields = {f['name']: f for f in json.loads(gh('project', 'field-list', pnum, '--owner', owner, '--format', 'json'))['fields']}
item = json.loads(gh('project', 'item-add', pnum, '--owner', owner, '--url', url, '--format', 'json'))
def set_opt(field, value):
    opts = {o['name']: o['id'] for o in fields[field]['options']}
    if value not in opts: sys.exit(f"board: unknown {field} '{value}' (options: {', '.join(opts)})")
    gh('project', 'item-edit', '--id', item['id'], '--project-id', proj['id'], '--field-id', fields[field]['id'], '--single-select-option-id', opts[value])
set_opt('Status', stage)
if area: set_opt('Area', area)
print(f"board: {url.rsplit('/', 2)[-2]} #{url.rsplit('/', 1)[-1]} -> {stage}" + (f" [{area}]" if area else ''))
PY
