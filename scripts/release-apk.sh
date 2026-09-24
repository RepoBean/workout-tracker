#!/usr/bin/env bash
# Build the Android APK from HEAD and publish it as a GitHub Release.
#   scripts/release-apk.sh [--skip-build]
# The newest release is always at:
#   https://github.com/<owner>/<repo>/releases/latest/download/workout-tracker.apk
# Built locally (not in CI) so every APK is signed by the debug keystore in the
# workout-tracker-android-home volume — Android only installs an update over an
# existing app when the signature matches.
# The APK bundles the frontend: UI changes reach the phones only via a new release.
source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

SKIP_BUILD=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

cd "$REPO_DIR"
command -v gh >/dev/null || die "gh not installed (sudo apt install gh && gh auth login)"
gh auth status >/dev/null 2>&1 || die "gh not logged in (gh auth login)"

[ -z "$(git status --porcelain --untracked-files=no)" ] \
  || die "uncommitted changes — a release must match a commit"
SHA="$(git rev-parse --short HEAD)"
FULL_SHA="$(git rev-parse HEAD)"
TAG="apk-$SHA"

git fetch -q origin
git merge-base --is-ancestor HEAD origin/main \
  || die "HEAD $SHA is not on origin/main — git push first"
if gh release view "$TAG" >/dev/null 2>&1; then
  die "release $TAG already exists"
fi

APK="$HOME/apk/workout-tracker-${SHA}-debug.apk"
if [ "$SKIP_BUILD" = "1" ]; then
  [ -f "$APK" ] || die "--skip-build but $APK does not exist"
  log "reusing $APK"
else
  log "building APK at $SHA"
  scripts/build-apk.sh
fi

# Fixed asset name so the releases/latest/download/ link never changes.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
cp "$APK" "$STAGE/workout-tracker.apk"

PREV="$(git tag --list 'apk-*' --sort=-creatordate | head -1)"
{
  echo "Android app built from \`$SHA\`."
  echo
  echo "Install: open this page on the phone, tap **workout-tracker.apk**, allow installs from Chrome."
  echo "Installs over the previous version; settings and server URL are kept."
  if [ -n "$PREV" ]; then
    echo
    echo "Changes since \`$PREV\`:"
    git log --no-merges --format='- %s' "$PREV..HEAD" -- frontend | head -40
  fi
} > "$STAGE/notes.md"

log "publishing $TAG"
gh release create "$TAG" "$STAGE/workout-tracker.apk" \
  --target "$FULL_SHA" --title "Android app $SHA" --notes-file "$STAGE/notes.md" --latest
git fetch -q --tags origin

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
log "done — phones download from:"
echo "  https://github.com/$REPO/releases/latest/download/workout-tracker.apk"
