#!/usr/bin/env bash
# Redeploy a previously built image tag (see ~/backups/workout-tracker/deploys.log).
#   scripts/rollback.sh <main|wife|staging> <tag> [--restore <backup.sqlite>] [--force]
# Never builds: the tag must already exist locally (docker images workout-tracker-backend).
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
TAG="${1:-}"; [ -n "$TAG" ] || die "usage: rollback.sh <instance> <tag> [--restore <file>] [--force]"
shift
RESTORE=""; FORCE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --restore) RESTORE="$2"; shift ;;
    --force) FORCE=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done
export FORCE TAG

for img in workout-tracker-backend workout-tracker-frontend; do
  docker image inspect "$img:$TAG" >/dev/null 2>&1 || die "image $img:$TAG not found locally — cannot roll back to it"
done

if backend_running; then
  refuse_if_active
  log "backup before rollback"
  "$REPO_DIR/scripts/backup.sh" "$INSTANCE" | tail -1 | sed 's/^/  saved: /'
fi

log "starting $INSTANCE at $TAG (no build)"
compose up -d --no-build --wait --remove-orphans
wait_healthy 60 || die "$INSTANCE did not become healthy on :$PORT"
printf '%s %s %s (rollback)\n' "$(date -Iseconds)" "$INSTANCE" "$TAG" >> "$DEPLOY_LOG"
log "$INSTANCE is up on :$PORT at $TAG — $(counts_line)"
docker ps --filter "name=^$BACKEND$" --filter "name=^$FRONTEND$" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'

if [ -n "$RESTORE" ]; then
  log "restoring data from $RESTORE"
  "$REPO_DIR/scripts/restore.sh" "$INSTANCE" "$RESTORE" --yes --force
fi
