#!/usr/bin/env bash
# Snapshot a fixed set of read-only API responses from one instance, one file
# per call with JSON keys sorted, so two snapshots can be `diff -r`'d.
#   scripts/api-snapshot.sh <main|wife|staging> <outdir>
# Used to prove a backend refactor is byte-for-byte identical: snapshot the old
# image, deploy, snapshot again, diff. Run both within the same day (stats are
# date-relative). Needs jq on the host.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
OUT="${1:-}"; [ -n "$OUT" ] || die "usage: api-snapshot.sh <instance> <outdir>"
command -v jq >/dev/null || die "jq is required"
mkdir -p "$OUT"

snap() { # <name> <api path>
  local name="$1" path="$2" body
  body="$(api_get "$path")" || die "GET $path failed"
  if [[ "$path" == *export-csv* ]]; then
    printf '%s\n' "$body" > "$OUT/$name.csv"
  else
    printf '%s' "$body" | jq -S . > "$OUT/$name.json" || die "GET $path returned non-JSON"
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

# Newest 5 sessions by id, and exports for every non-archived program
for id in $(jq -r '.[].id' "$OUT/history-all.json" | head -5); do
  snap "session-$id" "sessions/$id"
done
for id in $(jq -r '.[].id' "$OUT/programs-active.json"); do
  snap "program-$id" "programs/$id"
  snap "program-$id-export" "programs/$id/export"
done

# The 8 most-logged exercise names → the two name-lookup endpoints
jq -r '[.[].sets[].exerciseName] | group_by(.) | map({n: .[0], c: length}) | sort_by(-.c) | .[:8][].n' \
  "$OUT/history-all.json" | while IFS= read -r name; do
  slug="$(printf '%s' "$name" | tr -cs 'A-Za-z0-9' '-' | tr 'A-Z' 'a-z')"
  enc="$(jq -rn --arg s "$name" '$s|@uri')"
  snap "by-name-$slug-latest" "exercises/history-by-name?name=$enc"
  snap "by-name-$slug-all"    "exercises/all-sets-by-name?name=$enc"
done

# Strip the one field that legitimately differs per call (export timestamp)
for f in "$OUT"/program-*-export.json; do
  [ -f "$f" ] && jq -S 'del(.exportedAt)' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
done

log "$INSTANCE: $(ls "$OUT" | wc -l) snapshot files in $OUT"
