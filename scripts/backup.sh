#!/usr/bin/env bash
# Consistent backup of one instance's SQLite DB.
#   scripts/backup.sh <main|wife|staging> [--dir DIR]
# Writes DIR/<instance>-<YYYYMMDD-HHMMSS>.sqlite (default ~/backups/workout-tracker)
# and prints the path on the last line of stdout (other scripts capture it).
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
DIR="$BACKUP_DIR"
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    *) die "unknown option: $1" ;;
  esac
done

backend_running || die "$INSTANCE backend container ($BACKEND) is not running"
mkdir -p "$DIR"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$DIR/$INSTANCE-$STAMP.sqlite"
TMP_IN_VOLUME="/data/.backup-tmp.sqlite"

log "$INSTANCE: snapshotting /data/database.sqlite inside $BACKEND (VACUUM INTO)"
RESULT="$(docker exec -i -w /app -e DEST="$TMP_IN_VOLUME" "$BACKEND" node < "$REPO_DIR/scripts/lib/snapshot.js")" || {
  echo "$RESULT" >&2; die "snapshot failed inside the container"
}
echo "$RESULT" | node -e 'const r=JSON.parse(require("fs").readFileSync(0,"utf8")); if(!r.ok){console.error(r);process.exit(1)}' \
  || die "snapshot reported a problem"

docker cp "$BACKEND:$TMP_IN_VOLUME" "$OUT"
docker exec "$BACKEND" rm -f "$TMP_IN_VOLUME"

# Independent check on the host copy.
HOST_CHECK="$(python3 - "$OUT" <<'PY'
import sqlite3, sys
db = sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True)
integ = db.execute("PRAGMA integrity_check").fetchone()[0]
counts = {t: db.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0] for t in ["Programs","Workouts","Exercises","Sessions","Sets"]}
print(("ok" if integ == "ok" else "BAD:" + integ) + " " + " ".join(f"{k}={v}" for k, v in counts.items()))
PY
)"
case "$HOST_CHECK" in ok*) ;; *) rm -f "$OUT"; die "host integrity check failed: $HOST_CHECK" ;; esac

log "$INSTANCE: backup OK — $(du -h "$OUT" | cut -f1) ${HOST_CHECK#ok }"
echo "$OUT"
