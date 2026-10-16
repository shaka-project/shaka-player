# MKV integration fixtures

These original fixtures contain four seconds of an FFmpeg test pattern and/or
a generated 440 Hz tone. No third-party media is used. They are distributed under
the repository's Apache-2.0 license.

Regenerate with:

```sh
python3 test/test/assets/mkv/generate.py
```

The generator requires FFmpeg with libx264, libx265, libsvtav1, libvpx, libopus,
and libmp3lame. The checked-in files let browser tests run without FFmpeg.
Encoder versions can change the output bytes; regeneration is not expected to
be byte-for-byte identical.

Video is 160 by 128 pixels, 12 fps, 8-bit YUV 4:2:0. AVC includes B-frames.
Audio is stereo at 48 kHz. Clusters are limited to one second to exercise
segment transitions and seeking. Individual codec files contain only audio or
only video.

| Video | Audio | Subtitles |
| --- | --- | --- |
| AVC | AAC | SRT, ASCII, SSA |
| HEVC | E-AC-3 | ASS |
| AV1 | Opus | SRT |
| VP9 | FLAC | ASS |
| VP8 | Vorbis | SRT |
| AVC | AC-3 | ASS |
| AVC | MP3 | SRT |
| VP8 | AAC | ASS |
| AVC | Vorbis | SRT |

Every combined fixture has English captions, `First caption` at 0.5–1.5 seconds
and `Second caption` at 2–3.5 seconds, and two chapters: `Opening` at 0–2 seconds
and `Ending` at 2–4 seconds. Muxing may shift subtitle timestamps by the encoder
delay. The generator documents the small container edits needed for the ASCII
and SSA codec identifiers, which FFmpeg does not write directly.

The integration suite plays each combination once on the main thread, checks
delivered caption text and timestamps, checks chapter titles and boundaries,
and seeks forward and backward. Worker tests are intentionally excluded.

Playback cases are marked pending when the browser does not support the output
codec. These fixtures cover the base codec families; they do not claim coverage
of Dolby Vision metadata or every codec profile, bit depth, or channel layout.
