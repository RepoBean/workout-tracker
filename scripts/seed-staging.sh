#!/usr/bin/env bash
# Refresh staging with a fresh consistent copy of main's data.
#   scripts/seed-staging.sh
# Staging must already be up (scripts/ship.sh staging).
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

FILE="$("$REPO_DIR/scripts/backup.sh" main | tail -1)"
log "seeding staging from $FILE"
exec "$REPO_DIR/scripts/restore.sh" staging "$FILE" --yes --force
