#!/usr/bin/env bash
# Remove old workout-tracker image tags, keeping the newest N (default 5) plus
# anything a container is still using. Each backend+frontend pair is ~360 MB.
#   scripts/prune-images.sh [keep]
set -euo pipefail
KEEP="${1:-5}"
IN_USE="$(docker ps -a --format '{{.Image}}' | sort -u)"
for repo in workout-tracker-backend workout-tracker-frontend; do
  # newest first
  mapfile -t tags < <(docker images "$repo" --format '{{.CreatedAt}}\t{{.Tag}}' | sort -r | cut -f2)
  n=0
  for tag in "${tags[@]}"; do
    n=$((n + 1))
    img="$repo:$tag"
    if [ "$n" -le "$KEEP" ] || grep -qx "$img" <<<"$IN_USE"; then
      echo "keep   $img"
    else
      echo "remove $img"; docker rmi "$img" >/dev/null
    fi
  done
done
# Leftovers from the pre-Step-Zero compose projects (old naming), if any.
for old in workout-tracker_backend workout-tracker_frontend workout-tracker-wife-backend workout-tracker-wife-frontend; do
  if docker image inspect "$old:latest" >/dev/null 2>&1 && ! grep -qx "$old:latest" <<<"$IN_USE"; then
    echo "remove $old:latest (legacy)"; docker rmi "$old:latest" >/dev/null
  fi
done
