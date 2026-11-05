#!/usr/bin/env bash
# Reverse-proxy a live LL-HLS origin and stall the first media segment mid-body.
#
# Accepts either the origin host or a full playlist URL:
#   ./repro/run_stall_proxy.sh https://your-origin.example
#   ./repro/run_stall_proxy.sh https://your-origin.example/live/public/playlist.m3u8
#
# mitmproxy reverse mode needs scheme://host[:port] only (no path).
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
VENV="${ROOT}/.venv"
INPUT="${1:-${ORIGIN:-}}"
PORT="${PORT:-8080}"

if [[ -z "${INPUT}" ]]; then
  echo "Usage: $0 <origin-or-playlist-url>" >&2
  echo "Example: $0 https://streaming-origin.example" >&2
  echo "Example: $0 https://streaming-origin.example/live/public/playlist.m3u8" >&2
  exit 1
fi

# Split into origin (for mitmproxy) and path (for the local player URL hint).
eval "$(python3 - "${INPUT}" <<'PY'
import sys
from urllib.parse import urlsplit, urlunsplit

raw = sys.argv[1]
parts = urlsplit(raw)
if parts.scheme not in ("http", "https") or not parts.netloc:
    raise SystemExit(f"Need an http(s) URL with a host, got: {raw!r}")

origin = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
path = parts.path or "/"
if parts.query:
    path = f"{path}?{parts.query}"
# Shell-safe single-quoted values.
def q(s: str) -> str:
    return "'" + s.replace("'", "'\"'\"'") + "'"

print(f"ORIGIN={q(origin)}")
print(f"PLAYLIST_PATH={q(path)}")
PY
)"

if [[ ! -x "${VENV}/bin/mitmdump" ]]; then
  python3 -m venv "${VENV}"
  "${VENV}/bin/pip" install -q mitmproxy
fi

export STALL_BYTES="${STALL_BYTES:-8000}"
export STALL_SECONDS="${STALL_SECONDS:-6}"
export STALL_AFTER_SECONDS="${STALL_AFTER_SECONDS:-0}"
export STALL_MODE="${STALL_MODE:-cut}"
export STALL_ONCE="${STALL_ONCE:-1}"
export STALL_VIDEO_ONLY="${STALL_VIDEO_ONLY:-1}"
export STALL_REQUIRE_RANGE="${STALL_REQUIRE_RANGE:-0}"

PLAYER_URL="http://127.0.0.1:${PORT}${PLAYLIST_PATH}"

echo "Proxy:  http://127.0.0.1:${PORT}  ->  ${ORIGIN}"
echo "Stall:  after ${STALL_AFTER_SECONDS}s of play, ${STALL_BYTES}B then ${STALL_MODE} ${STALL_SECONDS}s (once=${STALL_ONCE}, video_only=${STALL_VIDEO_ONLY}, require_range=${STALL_REQUIRE_RANGE})"
echo "Player: ${PLAYER_URL}"

exec "${VENV}/bin/mitmdump" \
  -s "${ROOT}/stall_ll_hls_segment.py" \
  --mode "reverse:${ORIGIN}" \
  --listen-host 127.0.0.1 \
  --listen-port "${PORT}" \
  --set ssl_insecure=true
