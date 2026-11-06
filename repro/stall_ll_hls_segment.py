"""
Stall an LL-HLS media segment mid-body so Shaka hits stallTimeout and retries.

Reproduces the streamDataCallback retry path used with
allowLowLatencyByteRangeOptimization.

Usage (reverse proxy — easiest with our origin):

  export ORIGIN=https://your-origin.example
  mitmdump -s repro/stall_ll_hls_segment.py \\
    --mode "reverse:$ORIGIN" \\
    --listen-host 0.0.0.0 --listen-port 8080 \\
    --set ssl_insecure=true

Point the player at http://127.0.0.1:8080/... instead of $ORIGIN/...
(master playlist path stays the same, e.g. /live/public/playlist.m3u8).

Environment:
  STALL_BYTES=8000      Forward this many body bytes, then cut/stall/kill.
                        Use enough to cover at least one complete mdat.
  STALL_SECONDS=6       Silence duration for mode=cut and mode=stall.
                        For cut, use > Shaka stallTimeout (default 5s).
  STALL_AFTER_SECONDS=0 Wait this long after play start before any disrupt.
                        Play start = first .m3u8 request through the proxy.
  STALL_MODE=cut        Modes:
                        "cut" (recommended) = send N bytes, stay silent so
                        Shaka aborts on stallTimeout, then drop the rest
                        (no immediate flow.kill()).
                        "stall" = silence then resume the SAME body.
                        "kill" = send N bytes then flow.kill() immediately
                        (often ERR_INCOMPLETE_CHUNKED_ENCODING).
  STALL_ONCE=1          Only disrupt the first matching segment (default).
  STALL_VIDEO_ONLY=1    Prefer / skip to video .m4s (default). Set 0 to allow audio.
  STALL_REQUIRE_RANGE=0 If 1, only disrupt requests that send a Range header.
  STALL_PATH_REGEX=     Override path match (default: public .m4s, not init).
"""

from __future__ import annotations

import os
import re
import threading
import time

from mitmproxy import ctx, http


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return float(raw)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw not in ("0", "false", "False", "no", "NO")


DEFAULT_PATH_REGEX = (
    # Our origin public fragments: /live/public/<name>.m4s
    # Skip init segments and playlists.
    r"/live/public/(?!.*(?:_init|init))[^/?]*\.m4s(?:$|\?)"
)


def _banner(title: str, *lines: str) -> None:
    """Print a hard-to-miss block in the mitmdump console."""
    bar = "=" * 72
    ctx.log.warn(bar)
    ctx.log.warn(f"  {title}")
    for line in lines:
        ctx.log.warn(f"  {line}")
    ctx.log.warn(bar)


class StallTransform:
    """
    mitmproxy 12 calls response.stream(data) once per body chunk (bytes),
    and once with b'' at end-of-message. It must return bytes or an iterable
    of bytes — NOT iterate the input as if it were a list of chunks.
    """

    def __init__(self, flow: http.HTTPFlow, addon: "StallLlHlsSegment") -> None:
        self.flow = flow
        self.addon = addon
        self.sent = 0
        self.disrupted = False
        self.done = False

    def __call__(self, data: bytes) -> list[bytes]:
        if self.done:
            return []

        # End-of-message marker from mitmproxy.
        if data == b"":
            if not self.disrupted and self.sent > 0:
                _banner(
                    "STALL SKIPPED — BODY TOO SHORT",
                    f"segment ended after only {self.sent}B "
                    f"(wanted {self.addon.bytes_before_stall}B before stall)",
                    f"url={self.flow.request.pretty_url}",
                    "Releasing claim so a later segment can be targeted",
                )
                self.addon.release_claim(self.flow.request.pretty_url)
            return []

        if not isinstance(data, (bytes, bytearray, memoryview)):
            ctx.log.error(
                f"[stall-proxy] unexpected stream chunk type={type(data)!r}; "
                "passing through"
            )
            return [data] if data else []

        chunk = bytes(data)

        if self.disrupted:
            if self.addon.drops_rest():
                return []
            return [chunk]

        remaining = self.addon.bytes_before_stall - self.sent
        if remaining <= 0:
            self._disrupt()
            if self.addon.drops_rest():
                return []
            return [chunk]

        if len(chunk) <= remaining:
            self.sent += len(chunk)
            return [chunk]

        head = chunk[:remaining]
        tail = chunk[remaining:]
        self.sent += len(head)
        ctx.log.warn(
            f"[stall-proxy] forwarding partial chunk: "
            f"{len(head)}B now / {len(tail)}B held "
            f"(total_sent_before_disrupt={self.sent}B)"
        )
        out = [head]
        self._disrupt()
        if self.addon.drops_rest():
            return out
        if tail:
            out.append(tail)
        return out

    def _disrupt(self) -> None:
        if self.disrupted:
            return
        self.disrupted = True
        self.addon.mark_disrupted()
        range_header = self.flow.request.headers.get("Range", "")
        mode = self.addon.mode

        if mode == "kill":
            _banner(
                "KILL NOW — DROP CONNECTION",
                f"sent={self.sent}B then kill the client connection",
                "Often shows net::ERR_INCOMPLETE_CHUNKED_ENCODING",
                "Prefer STALL_MODE=cut for a cleaner Shaka stall abort",
                f"Range={range_header!r}",
                f"url={self.flow.request.pretty_url}",
                f"play_elapsed={self.addon._elapsed():.1f}s",
            )
            self.done = True
            try:
                self.flow.client_conn.error = (
                    "LL-HLS stall proxy cut segment mid-body"
                )
            except Exception:
                pass
            try:
                self.flow.kill()
            except Exception as exc:
                ctx.log.warn(f"[stall-proxy] flow.kill() failed: {exc}")
            return

        if mode == "cut":
            _banner(
                "CUT NOW — SILENCE THEN DROP",
                f"sent={self.sent}B to client",
                f"staying silent for {self.addon.stall_seconds}s "
                f"(> Shaka stallTimeout) so the player aborts",
                "then dropping the rest of this body (no flow.kill())",
                f"Range={range_header!r}",
                f"url={self.flow.request.pretty_url}",
                f"play_elapsed={self.addon._elapsed():.1f}s",
            )
            t0 = time.monotonic()
            time.sleep(self.addon.stall_seconds)
            self.done = True
            _banner(
                "CUT NOW — DROP REST",
                f"slept={time.monotonic() - t0:.2f}s; discarding remaining body",
                "Watch for POST-CUT REQUEST (Shaka retry)",
                f"url={self.flow.request.pretty_url}",
                f"play_elapsed={self.addon._elapsed():.1f}s",
            )
            return

        # mode == stall
        _banner(
            "STALL NOW — SILENCE START",
            f"sent={self.sent}B to client, now silent for "
            f"{self.addon.stall_seconds}s",
            "Then resumes the SAME body (weak for the retry/buffer bug)",
            f"Range={range_header!r}",
            f"url={self.flow.request.pretty_url}",
            f"play_elapsed={self.addon._elapsed():.1f}s",
        )
        t0 = time.monotonic()
        time.sleep(self.addon.stall_seconds)
        _banner(
            "STALL NOW — SILENCE END",
            f"slept={time.monotonic() - t0:.2f}s, resuming SAME body",
            f"url={self.flow.request.pretty_url}",
            f"play_elapsed={self.addon._elapsed():.1f}s",
            "Prefer STALL_MODE=cut for the streamDataCallback retry bug",
        )


class StallLlHlsSegment:
    def __init__(self) -> None:
        self.bytes_before_stall = _env_int("STALL_BYTES", 8000)
        self.stall_seconds = _env_float("STALL_SECONDS", 6.0)
        self.stall_after_seconds = _env_float("STALL_AFTER_SECONDS", 0.0)
        self.mode = os.environ.get("STALL_MODE", "cut").strip().lower()
        if self.mode not in ("cut", "stall", "kill"):
            raise SystemExit(
                f"STALL_MODE must be cut|stall|kill, got {self.mode!r}"
            )
        self.once = _env_bool("STALL_ONCE", True)
        self.video_only = _env_bool("STALL_VIDEO_ONLY", True)
        self.require_range = _env_bool("STALL_REQUIRE_RANGE", False)
        self.path_re = re.compile(
            os.environ.get("STALL_PATH_REGEX", DEFAULT_PATH_REGEX)
        )
        # Claim the chosen segment as soon as response headers arrive so
        # concurrent .m4s responses cannot all attach a StallTransform.
        self._lock = threading.Lock()
        self.target_claimed = False
        self.target_done = False
        self.chosen_url: str | None = None
        self.chosen_path: str | None = None
        self.stalled_count = 0
        self.play_started_at: float | None = None
        self._armed_logged = False
        self._last_countdown_bucket = -1
        self._retry_logged = False

    def load(self, loader) -> None:
        _banner(
            "LL-HLS STALL PROXY READY",
            f"bytes_before_stall={self.bytes_before_stall}",
            f"stall_seconds={self.stall_seconds}",
            f"stall_after_seconds={self.stall_after_seconds} "
            "(from first .m3u8 = play start)",
            f"mode={self.mode} once={self.once} "
            f"video_only={self.video_only} require_range={self.require_range}",
            "Exactly one segment will be claimed and disrupted",
        )

    def _elapsed(self) -> float:
        if self.play_started_at is None:
            return 0.0
        return time.monotonic() - self.play_started_at

    def mark_disrupted(self) -> None:
        with self._lock:
            self.stalled_count += 1
            self.target_done = True

    def drops_rest(self) -> bool:
        """True if remaining upstream body must not be forwarded to the client."""
        return self.mode in ("cut", "kill")

    def release_claim(self, url: str) -> None:
        """Allow another segment if the claimed one was too short to cut."""
        with self._lock:
            if self.target_done:
                return
            if self.chosen_url != url:
                return
            self.target_claimed = False
            self.chosen_url = None
            self.chosen_path = None
            ctx.log.warn("[stall-proxy] claim released; waiting for next video .m4s")

    def try_claim(self, flow: http.HTTPFlow) -> bool:
        """Atomically claim this response as the one-and-only disruption target."""
        if not self.once:
            return True
        with self._lock:
            if self.target_claimed or self.target_done:
                return False
            self.target_claimed = True
            self.chosen_url = flow.request.pretty_url
            self.chosen_path = flow.request.path or ""
            return True

    def _is_retry_of_chosen(self, flow: http.HTTPFlow) -> bool:
        if not self.chosen_path:
            return False
        path = flow.request.path or ""
        # Same path = retry of the cut segment (ignore unrelated later segments).
        return path.split("?", 1)[0] == self.chosen_path.split("?", 1)[0]

    def requestheaders(self, flow: http.HTTPFlow) -> None:
        path = flow.request.path or ""
        if self.play_started_at is None and path.endswith(".m3u8"):
            self.play_started_at = time.monotonic()
            _banner(
                "PLAY START",
                f"url={flow.request.pretty_url}",
                f"disruption arms in {self.stall_after_seconds:.0f}s "
                f"(STALL_AFTER_SECONDS)",
            )
            return

        if (
            self.target_done
            and not self._retry_logged
            and self._is_retry_of_chosen(flow)
        ):
            self._retry_logged = True
            range_header = flow.request.headers.get("Range", "")
            _banner(
                "POST-CUT REQUEST (likely Shaka retry of chosen segment)",
                f"Range={range_header!r}",
                f"url={flow.request.pretty_url}",
                f"play_elapsed={self._elapsed():.1f}s",
                "Unfixed: often restarts near bytes=0- / original start",
                "Fixed: resumes at last committed mdat offset",
            )

        if (
            self.play_started_at is not None
            and not self._armed_logged
            and path.endswith(".m3u8")
        ):
            remaining = self.stall_after_seconds - self._elapsed()
            if remaining > 0:
                bucket = int(remaining) // 30
                if bucket != self._last_countdown_bucket:
                    self._last_countdown_bucket = bucket
                    ctx.log.warn(
                        f"[stall-proxy] waiting to arm: "
                        f"{remaining:.0f}s left "
                        f"(elapsed={self._elapsed():.0f}s / "
                        f"{self.stall_after_seconds:.0f}s)"
                    )

    def _is_media_segment(self, flow: http.HTTPFlow) -> bool:
        path = flow.request.path or ""
        if not self.path_re.search(path):
            return False
        if path.endswith(".m3u8") or path.endswith(".mpd"):
            return False
        if self.video_only and "video" not in path.lower():
            return False
        if self.require_range and not flow.request.headers.get("Range"):
            return False
        return True

    def _disruption_armed(self) -> bool:
        if self.play_started_at is None:
            return False
        elapsed = self._elapsed()
        if elapsed < self.stall_after_seconds:
            return False
        if not self._armed_logged:
            self._armed_logged = True
            _banner(
                "DISRUPTION ARMED",
                f"elapsed={elapsed:.1f}s "
                f"(threshold={self.stall_after_seconds:.0f}s)",
                "Exactly one matching .m4s will be claimed and cut",
            )
        return True

    def responseheaders(self, flow: http.HTTPFlow) -> None:
        if not self._is_media_segment(flow):
            return
        if flow.response is None:
            return
        if flow.response.status_code not in (200, 206):
            return

        # Always stream LL bodies; never buffer whole segments.
        if not self._disruption_armed():
            flow.response.stream = True
            return

        if not self.try_claim(flow):
            flow.response.stream = True
            return

        range_header = flow.request.headers.get("Range", "")
        _banner(
            "TARGET SEGMENT SELECTED (only this one)",
            f"will forward {self.bytes_before_stall}B then {self.mode}",
            f"Range={range_header!r}",
            f"status={flow.response.status_code}",
            f"url={flow.request.pretty_url}",
            f"play_elapsed={self._elapsed():.1f}s",
            "All other segments pass through untouched",
        )
        flow.response.stream = StallTransform(flow, self)


addons = [StallLlHlsSegment()]

