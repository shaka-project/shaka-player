# MMTP fixtures

Captured from a real producer, FFmpeg's `moq_mmt` muxer, on 2026-10-16 (binary
`ffmpeg version 8.0.git`, sha256 `8c935392e634f63a…`; libmmt-backed build).

| File | Contents |
| --- | --- |
| `av-h264-aac.mmtp` | 472 MMTP packets, each a big-endian 32-bit length then the packet (one UDP payload). Packet ID 1 is H.264 video, 2 is AAC-LC audio, 0 is the signaling flow. |
| `video-init.mp4` | The video initialization segment as the muxer writes it for a catalog (`-video_init_data_path`). |
| `audio-init.mp4` | The audio initialization segment, likewise (`-audio_init_data_path`). |

A MoQT Object of an MMTP track is one of these packets, so a test reads the
packets of one packet ID as the Objects of one track.

Regenerate with a receiver joined to `239.255.42.99:5004` on `127.0.0.1` that
writes each datagram as length + bytes, while running:

```sh
ffmpeg -f lavfi -i "testsrc2=size=160x90:rate=15" \
  -f lavfi -i "sine=frequency=440:sample_rate=48000" -t 2 \
  -c:v libx264 -preset ultrafast -tune zerolatency -g 15 -keyint_min 15 \
  -sc_threshold 0 -bf 0 -b:v 200k -pix_fmt yuv420p \
  -c:a aac -b:a 64k -ac 2 \
  -f moq_mmt -moq_enabled 0 -multicast_enabled 1 \
  -mcast_addr 239.255.42.99 -mcast_port 5004 -mcast_local_addr 127.0.0.1 \
  -mcast_container mmtp \
  -video_init_data_path video-init.mp4 -audio_init_data_path audio-init.mp4 \
  moq://unused
```
