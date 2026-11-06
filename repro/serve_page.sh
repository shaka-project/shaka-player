#!/usr/bin/env bash
# Serve the local Shaka repro page (default http://0.0.0.0:8090/).
# Bind all interfaces so other devices on the LAN can open the UI.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${PAGE_PORT:-8090}"
BIND="${PAGE_BIND:-0.0.0.0}"

LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
LAN_IP="${LAN_IP:-<this-machine-lan-ip>}"

echo "Shaka repro page bound to ${BIND}:${PORT}"
echo "  local:  http://127.0.0.1:${PORT}/"
echo "  LAN:    http://${LAN_IP}:${PORT}/"
echo "On another device, set the manifest to this machine's proxy, e.g."
echo "  http://${LAN_IP}:8080/live/public/playlist.m3u8"
exec python3 -m http.server "${PORT}" --bind "${BIND}" --directory "${ROOT}"
