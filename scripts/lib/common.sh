#!/usr/bin/env bash
# Shared helpers for the workout-tracker ops scripts. Source, don't run.
#
# Instances: main (8035) / wife (8036) / staging (8037). Each is a compose
# profile in docker-compose.yml with its own container pair + named volume.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKUP_DIR="${WT_BACKUP_DIR:-$HOME/backups/workout-tracker}"
DEPLOY_LOG="$BACKUP_DIR/deploys.log"

log()  { printf '\033[1;36m[%s]\033[0m %s\n' "$(date +%H:%M:%S)" "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

# Sets INSTANCE, BACKEND, FRONTEND, PORT, VOLUME for a given instance name.
require_instance() {
  local name="${1:-}"
  case "$name" in
    main)    BACKEND=workout-tracker-backend;         FRONTEND=workout-tracker-frontend;         PORT=8035; VOLUME=workout-tracker-data ;;
    wife)    BACKEND=workout-tracker-wife-backend;    FRONTEND=workout-tracker-wife-frontend;    PORT=8036; VOLUME=workout-tracker-wife-data ;;
    staging) BACKEND=workout-tracker-staging-backend; FRONTEND=workout-tracker-staging-frontend; PORT=8037; VOLUME=workout-tracker-staging-data ;;
    *) die "usage: $(basename "$0") <main|wife|staging> ... (got '${name}')" ;;
  esac
  INSTANCE="$name"
  export INSTANCE BACKEND FRONTEND PORT VOLUME
}

compose() { docker compose --project-directory "$REPO_DIR" --profile "$INSTANCE" "$@"; }

backend_running() { [ "$(docker inspect -f '{{.State.Running}}' "$BACKEND" 2>/dev/null || echo false)" = "true" ]; }

api_get() { curl -fsS --max-time 10 "http://127.0.0.1:${PORT}/api/$1"; }

# Prints "active" if a workout is in progress on this instance, "none" otherwise.
# Fails if the instance can't be reached (caller decides whether that matters).
active_session() {
  local body
  body="$(api_get sessions/active)" || return 1
  if [ "$body" = "null" ]; then echo none; else echo active; fi
}

# Refuse to proceed if a session is in progress; FORCE=1 downgrades to a warning.
refuse_if_active() {
  local state
  if ! state="$(active_session)"; then
    warn "$INSTANCE: could not query /api/sessions/active on :$PORT (instance down?) — skipping the active-session gate"
    return 0
  fi
  if [ "$state" = "active" ]; then
    if [ "${FORCE:-0}" = "1" ]; then
      warn "$INSTANCE has a workout IN PROGRESS — continuing because --force was given"
    else
      die "$INSTANCE has a workout IN PROGRESS on :$PORT. Never deploy mid-workout. Re-run with --force to override."
    fi
  fi
}

# One-line data summary from the API (sessions / last 30 days / programs).
counts_line() {
  local stats programs
  stats="$(api_get sessions/stats 2>/dev/null || echo '{}')"
  programs="$(api_get programs 2>/dev/null || echo '[]')"
  node -e '
    const s = JSON.parse(process.argv[1]); const p = JSON.parse(process.argv[2]);
    const n = (v) => (v === undefined ? "?" : v);
    console.log(`sessions=${n(s.totalSessions)} last30d=${n(s.sessionsLast30Days)} programs=${Array.isArray(p) ? p.length : "?"}`);
  ' "$stats" "$programs"
}

wait_healthy() {
  local tries="${1:-60}" i
  for ((i = 1; i <= tries; i++)); do
    if api_get health >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}

running_tag() {
  docker inspect -f '{{.Config.Image}}' "$BACKEND" 2>/dev/null | sed 's/.*://' || true
}
