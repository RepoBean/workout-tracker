#!/usr/bin/env bash
# Restore a backup file into one instance's volume.
#   scripts/restore.sh <main|wife|staging> <file.sqlite> [--yes] [--force]
# --yes    skip the interactive confirmation (used by seed-staging.sh)
# --force  proceed even if a workout is in progress on that instance
# Always takes a pre-restore backup of the current DB first.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
FILE="${1:-}"; [ -n "$FILE" ] || die "usage: restore.sh <instance> <file.sqlite> [--yes] [--force]"
shift
YES=0; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --yes) YES=1 ;;
    --force) FORCE=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done
export FORCE

[ -f "$FILE" ] || die "no such file: $FILE"
FILE="$(readlink -f "$FILE")"

CHECK="$(python3 - "$FILE" <<'PY'
import sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
integ = db.execute("PRAGMA integrity_check").fetchone()[0]
names = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
need = {"Programs","Workouts","Exercises","Sessions","Sets"}
if integ != "ok": print("BAD integrity: " + integ); sys.exit(1)
if not need <= names: print("BAD missing tables: " + ",".join(sorted(need - names))); sys.exit(1)
counts = {t: db.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in sorted(need)}
print(" ".join(f"{k}={v}" for k, v in counts.items()))
PY
)" || die "backup file failed validation: $CHECK"
log "restore source: $FILE ($CHECK)"

docker volume inspect "$VOLUME" >/dev/null 2>&1 || die "volume $VOLUME does not exist"

if backend_running; then
  refuse_if_active
  log "$INSTANCE currently: $(counts_line)"
fi

if [ "$YES" != "1" ]; then
  echo
  echo "This REPLACES the live database of instance '$INSTANCE' (volume $VOLUME)."
  read -r -p "Type the instance name to continue: " answer
  [ "$answer" = "$INSTANCE" ] || die "aborted"
fi

WAS_RUNNING=0
if backend_running; then
  WAS_RUNNING=1
  log "pre-restore safety backup of $INSTANCE"
  "$REPO_DIR/scripts/backup.sh" "$INSTANCE" | tail -1 | sed 's/^/  saved: /'
  log "stopping $BACKEND"
  docker stop "$BACKEND" >/dev/null
fi

log "copying into volume $VOLUME"
docker run --rm \
  -v "$VOLUME:/data" \
  -v "$(dirname "$FILE"):/src:ro" \
  alpine sh -ec "
    rm -f /data/database.sqlite /data/database.sqlite-journal /data/database.sqlite-wal /data/database.sqlite-shm
    cp /src/$(basename "$FILE") /data/database.sqlite
    chown 1001:1001 /data/database.sqlite
    chmod 644 /data/database.sqlite"

if [ "$WAS_RUNNING" = "1" ]; then
  log "starting $BACKEND"
  docker start "$BACKEND" >/dev/null
  wait_healthy 60 || die "$INSTANCE did not come back healthy on :$PORT"
  log "$INSTANCE restored: $(counts_line)"
else
  log "$INSTANCE backend was not running; data is in place for the next 'scripts/ship.sh $INSTANCE'"
fi
