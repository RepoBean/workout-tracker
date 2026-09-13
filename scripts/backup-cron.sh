#!/usr/bin/env bash
# Nightly: back up main + wife, prune, mirror to the NAS. Installed in crontab:
#   30 3 * * * /opt/docker/workout-tracker/scripts/backup-cron.sh
# Local copies kept 60 days; NAS copies kept 365 days.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

NAS_DIR="${WT_NAS_BACKUP_DIR:-/mnt/faster/backups/workout-tracker-db}"
LOG="$BACKUP_DIR/backup.log"
mkdir -p "$BACKUP_DIR"
exec >>"$LOG" 2>&1
echo "=== $(date -Iseconds) backup-cron start"

status=0
for inst in main wife; do
  if "$REPO_DIR/scripts/backup.sh" "$inst"; then :; else
    echo "!! backup of $inst FAILED"; status=1
  fi
done

find "$BACKUP_DIR" -maxdepth 1 -name '*.sqlite' -mtime +60 -print -delete | sed 's/^/pruned local: /'

if mountpoint -q "$(dirname "$NAS_DIR")" 2>/dev/null || [ -d "$(dirname "$NAS_DIR")" ]; then
  mkdir -p "$NAS_DIR"
  rsync -a --include='*.sqlite' --include='*.log' --exclude='*' "$BACKUP_DIR/" "$NAS_DIR/" \
    && echo "mirrored to $NAS_DIR" || { echo "!! rsync to $NAS_DIR FAILED"; status=1; }
  find "$NAS_DIR" -maxdepth 1 -name '*.sqlite' -mtime +365 -print -delete | sed 's/^/pruned nas: /'
else
  echo "!! NAS dir $(dirname "$NAS_DIR") not available — off-machine copy skipped"; status=1
fi

echo "=== $(date -Iseconds) backup-cron done (status $status)"
exit $status
