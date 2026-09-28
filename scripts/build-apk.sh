#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# 1. Node 22 via nvm
source ~/.nvm/nvm.sh
nvm use

# 2. Build frontend and sync native Android project
echo "==> Building frontend and syncing Capacitor Android..."
(cd frontend && npm run build && npx cap sync android)

# 3. Build Android builder container (cached after first build)
echo "==> Building Android builder Docker image..."
docker build -f Dockerfile.android -t workout-tracker-android .

# Ensure named volume exists and is writable by mapped user (only on first creation)
docker volume create workout-tracker-android-home >/dev/null
docker run --rm -v workout-tracker-android-home:/home/builder workout-tracker-android sh -c '[ -f /home/builder/.initialized ] || { chmod -R 777 /home/builder && touch /home/builder/.initialized; }' 2>/dev/null || true

# 4. Assemble debug APK using Gradle in Docker container
# versionCode = commit count (monotonic on main), versionName = short sha (+ -dirty).
VERSION_CODE="$(git rev-list --count HEAD)"
VERSION_NAME="$(git rev-parse --short HEAD)$([ -z "$(git status --porcelain --untracked-files=no)" ] || echo -dirty)"
echo "==> Running assembleDebug inside container (versionCode $VERSION_CODE, versionName $VERSION_NAME)..."
docker run --rm \
  --user "$(id -u):$(id -g)" \
  -e HOME=/home/builder \
  -e GRADLE_USER_HOME=/home/builder/.gradle \
  -v workout-tracker-android-home:/home/builder \
  -v "$PWD/frontend:/project" \
  -w /project/android \
  workout-tracker-android ./gradlew assembleDebug --no-daemon \
    -PversionCode="$VERSION_CODE" -PversionName="$VERSION_NAME"

# 5. Copy output APK to ~/apk
APK_SOURCE="frontend/android/app/build/outputs/apk/debug/app-debug.apk"
if [ ! -f "$APK_SOURCE" ]; then
  echo "Error: Output APK not found at $APK_SOURCE" >&2
  exit 1
fi

mkdir -p "$HOME/apk"
SHA="$(git rev-parse --short HEAD)"
TARGET_VERSIONED="$HOME/apk/workout-tracker-${SHA}-debug.apk"
TARGET_LATEST="$HOME/apk/latest.apk"

cp "$APK_SOURCE" "$TARGET_VERSIONED"
cp "$APK_SOURCE" "$TARGET_LATEST"

echo "==> APK build successful!"
echo "Versioned APK: $TARGET_VERSIONED"
echo "Latest APK:    $TARGET_LATEST"
