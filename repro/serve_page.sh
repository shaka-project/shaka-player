#!/usr/bin/env bash
# Serve the local Shaka repro page (default http://127.0.0.1:8090/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PAGE_PORT:-8090}"
echo "Shaka repro page: http://127.0.0.1:${PORT}/"
echo "Manifest should target the stall proxy, e.g. http://127.0.0.1:8080/live/public/playlist.m3u8"
exec python3 -m http.server "${PORT}" --bind 127.0.0.1 --directory "${ROOT}"
