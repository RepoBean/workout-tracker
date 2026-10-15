#!/usr/bin/env bash
# Refresh staging with a fresh consistent copy of main's data.
#   scripts/seed-staging.sh
# Staging must already be up (scripts/ship.sh staging).
# Main's coach API key and coach thread are scrubbed from the copy (v4 C2 D4): staging is
# where headless agents test, so it never holds them. Main's backup file is left untouched.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

FILE="$("$REPO_DIR/scripts/backup.sh" main | tail -1)"
SCRUBBED="$(dirname "$FILE")/staging-seed-$(date +%Y%m%d-%H%M%S).sqlite"
cp "$FILE" "$SCRUBBED"
trap 'rm -f "$SCRUBBED"' EXIT

python3 - "$SCRUBBED" <<'PY' || die "scrubbing the staging copy failed"
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='Settings'").fetchone():
    row = db.execute("SELECT value FROM Settings WHERE key='aiCoach'").fetchone()
    if row:
        coach = json.loads(row[0]); coach["apiKey"] = ""
        db.execute("UPDATE Settings SET value=? WHERE key='aiCoach'", (json.dumps(coach, separators=(",", ":")),))
    db.execute("DELETE FROM Settings WHERE key='coachThread'")
    db.commit()
    db.execute("VACUUM")
db.close()
PY

log "seeding staging from $FILE (coach key + thread scrubbed)"
"$REPO_DIR/scripts/restore.sh" staging "$SCRUBBED" --yes --force
