#!/usr/bin/env bash
set -euo pipefail

IP="$(hostname -I | awk '{print $1}')"
echo "Serving APK from $HOME/apk"
echo "Download URL: http://${IP}:8038/latest.apk"
echo "Press Ctrl-C to stop."

exec python3 -m http.server 8038 --bind 0.0.0.0 --directory "$HOME/apk"
