#!/usr/bin/env bash
# Deploy HEAD to one instance.
#   scripts/ship.sh <main|wife|staging> [--force] [--skip-tests]
# 1. tests + typecheck (both packages)      4. backup that instance
# 2. refuse if a workout is in progress     5. TAG=<sha> compose up -d --build --wait
# 3. (dirty tree → TAG=<sha>-dirty)         6. health, counts, deploys.log
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

require_instance "${1:-}"; shift
FORCE=0; SKIP_TESTS=0
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1 ;;
    --skip-tests) SKIP_TESTS=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done
export FORCE

cd "$REPO_DIR"
TAG="$(git rev-parse --short HEAD)"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  TAG="$TAG-dirty"
  warn "working tree has uncommitted changes — tagging images $TAG"
fi
export TAG

if [ "$SKIP_TESTS" != "1" ]; then
  log "backend: tsc --noEmit + vitest run"
  (cd backend && npx tsc --noEmit && npx vitest run) || die "backend tests/typecheck failed"
  log "frontend: tsc -b + vitest run"
  (cd frontend && npx tsc -b && npx vitest run) || die "frontend tests/typecheck failed"
else
  warn "tests skipped (--skip-tests)"
fi

if backend_running; then
  refuse_if_active
  if [ "$INSTANCE" = "wife" ]; then
    MAIN_TAG="$(docker inspect -f '{{.Config.Image}}' workout-tracker-backend 2>/dev/null | sed 's/.*://' || true)"
    [ "$MAIN_TAG" = "$TAG" ] || warn "main is running tag '${MAIN_TAG:-none}', you are shipping '$TAG' to wife — wife should lag main, never lead it"
  fi
  log "backup before deploy"
  scripts/backup.sh "$INSTANCE" | tail -1 | sed 's/^/  saved: /'
else
  warn "$INSTANCE is not running — first deploy, no gate/backup"
fi

# Build once per tag: a clean tag whose images already exist (built when
# shipping another instance) is reused as-is, so all instances share one image.
# A -dirty tag is always rebuilt because the tree may have changed since.
if [[ "$TAG" != *-dirty ]] \
   && docker image inspect "workout-tracker-backend:$TAG" >/dev/null 2>&1 \
   && docker image inspect "workout-tracker-frontend:$TAG" >/dev/null 2>&1; then
  log "images for $TAG already exist — reusing (no build)"
  compose up -d --no-build --wait --remove-orphans
else
  log "building + starting $INSTANCE at $TAG"
  compose up -d --build --wait --remove-orphans
fi

wait_healthy 60 || die "$INSTANCE did not become healthy on :$PORT"
mkdir -p "$BACKUP_DIR"
printf '%s %s %s\n' "$(date -Iseconds)" "$INSTANCE" "$TAG" >> "$DEPLOY_LOG"
log "$INSTANCE is up on :$PORT at $TAG — $(counts_line)"
docker ps --filter "name=^$BACKEND$" --filter "name=^$FRONTEND$" --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
