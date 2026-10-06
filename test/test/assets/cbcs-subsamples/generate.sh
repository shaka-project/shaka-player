#!/bin/sh
set -eu
cd "$(dirname "$0")"
: "${FFMPEG:=ffmpeg}"
: "${PACKAGER:=packager}"

# Entirely synthetic AV1, 4 columns x 2 rows of tiles.
"$FFMPEG" -hide_banner -loglevel error -f lavfi \
  -i testsrc2=size=640x360:rate=24 -t 2 \
  -c:v libsvtav1 -preset 10 -crf 40 -g 24 \
  -svtav1-params lp=2:tile-columns=2:tile-rows=1 \
  -movflags +frag_keyframe+empty_moov+default_base_moof \
  -y .generated-source.mp4
trap 'rm -f .generated-source.mp4' EXIT
mkdir -p clear cbcs

"$PACKAGER" \
  'in=.generated-source.mp4,stream=video,init_segment=clear/init.mp4,segment_template=clear/segment-$Number$.m4s,playlist_name=video.m3u8' \
  --segment_duration 1 --use_fake_clock_for_muxer --generate_static_live_mpd \
  --hls_master_playlist_output clear/master.m3u8 \
  --mpd_output clear/manifest.mpd

# These keys and IV are public test constants. Never use them for real content.
"$PACKAGER" \
  'in=.generated-source.mp4,stream=video,init_segment=cbcs/init.mp4,segment_template=cbcs/segment-$Number$.m4s,playlist_name=video.m3u8' \
  --segment_duration 1 --use_fake_clock_for_muxer --generate_static_live_mpd \
  --hls_master_playlist_output cbcs/master.m3u8 \
  --mpd_output cbcs/manifest.mpd \
  --enable_raw_key_encryption \
  --keys label=:key_id=000102030405060708090a0b0c0d0e0f:key=00112233445566778899aabbccddeeff \
  --iv 000102030405060708090a0b0c0d0e0f \
  --protection_scheme cbcs --protection_systems CommonSystem \
  --clear_lead 0 --hls_key_uri ../key.bin

python3 - <<'PY'
from pathlib import Path
Path('key.bin').write_bytes(bytes.fromhex('00112233445566778899aabbccddeeff'))
PY
python3 verify.py
