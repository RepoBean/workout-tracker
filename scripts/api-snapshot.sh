#!/usr/bin/env bash
# Snapshot a fixed set of read-only API responses from one instance, one file
# per call with JSON keys sorted, so two snapshots can be `diff -r`'d.
#   scripts/api-snapshot.sh <main|wife|staging> <outdir>
# Used to prove a backend refactor is byte-for-byte identical: snapshot the old
# image, deploy, snapshot again, diff. Run both within the same day (stats are
# date-relative).
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
OUT="${1:-}"; [ -n "$OUT" ] || die "usage: api-snapshot.sh <instance> <outdir>"
mkdir -p "$OUT"

# Pretty-print JSON with sorted keys; optionally drop one top-level key.
sort_json() { python3 -c '
import json, sys
data = json.load(sys.stdin)
drop = sys.argv[1] if len(sys.argv) > 1 else None
if drop and isinstance(data, dict): data.pop(drop, None)
json.dump(data, sys.stdout, indent=2, sort_keys=True, ensure_ascii=False); print()
' "$@"; }

snap() { # <name> <api path> [drop-key]
  local name="$1" path="$2" body
  body="$(api_get "$path")" || die "GET $path failed"
  if [[ "$path" == *export-csv* ]]; then
    printf '%s\n' "$body" > "$OUT/$name.csv"
  else
    printf '%s' "$body" | sort_json "${3:-}" > "$OUT/$name.json" || die "GET $path returned non-JSON"
  fi
}

snap programs                  "programs?includeArchived=true"
snap programs-active           "programs"
snap history-all               "sessions/history?limit=2000"
snap history-page              "sessions/history?limit=20&offset=20"
snap stats                     "sessions/stats"
snap active                    "sessions/active"
snap export-csv                "sessions/export-csv"
snap suggestions-pr            "exercises/suggestions?q=pr"
snap suggestions-row           "exercises/suggestions?q=row"

# Newest 5 session ids, every non-archived program id, and the 8 most-logged
# exercise names (URL-encoded), derived from the dumps above.
readarray -t SESSION_IDS < <(python3 -c 'import json,sys; [print(s["id"]) for s in json.load(open(sys.argv[1]))[:5]]' "$OUT/history-all.json")
readarray -t PROGRAM_IDS < <(python3 -c 'import json,sys; [print(p["id"]) for p in json.load(open(sys.argv[1]))]' "$OUT/programs-active.json")
readarray -t NAMES < <(python3 -c '
import json, sys, collections, urllib.parse, re
c = collections.Counter(s["exerciseName"] for sess in json.load(open(sys.argv[1])) for s in sess["sets"])
for name, _ in c.most_common(8):
    print(re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") + "\t" + urllib.parse.quote(name))
' "$OUT/history-all.json")

for id in "${SESSION_IDS[@]}"; do
  snap "session-$id" "sessions/$id"
  snap "session-$id-previous" "sessions/$id/previous"
done
for id in "${PROGRAM_IDS[@]}"; do
  snap "program-$id" "programs/$id"
  snap "program-$id-export" "programs/$id/export" exportedAt
done
for entry in "${NAMES[@]}"; do
  slug="${entry%%	*}"; enc="${entry#*	}"
  snap "by-name-$slug-latest" "exercises/history-by-name?name=$enc"
  snap "by-name-$slug-all"    "exercises/all-sets-by-name?name=$enc"
done

log "$INSTANCE: $(ls "$OUT" | wc -l) snapshot files in $OUT"
