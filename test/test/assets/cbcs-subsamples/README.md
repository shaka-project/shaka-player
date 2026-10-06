# CBCS subsample IV reproduction

This self-contained media fixture is a two-second, 640×360, 24 fps AV1 test
pattern. It has no audio or third-party footage. The clear and CBCS streams
contain the same video, packaged by the official Shaka Packager v3.9.3.
No jitmux service, license server, account, or private content is required.

## Reproduce

Serve this directory over HTTP, for example:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080/` in Safari on an AV1-capable device. The page
loads the official `shaka-player` npm distribution pinned to **v5.2.12**.
Click **Play clear reference**, then **Play CBCS sample**. The encrypted
video should match the clear reference. On the affected ClearKey WebCrypto
fallback, CBC chaining continues across subsamples, corrupting subsequent
protected ranges. Depending on the decoder, the result is visible corruption,
a playback error, or no decoded frames. Chrome may use native ClearKey instead
and therefore does not necessarily reproduce this fallback-specific issue.

The status panel reports the player version, decoded frames, errors, and
whether MediaKeys is attached, and the non-default player configuration. Both
HLS and static VOD DASH manifests are included.

To test a fixed build, put `shaka-player.compiled.js` beside this page and open
`?bundle=./shaka-player.compiled.js`. When this directory lives at
`test/test/assets/cbcs-subsamples` inside a Shaka checkout, serve the checkout
root and use `?bundle=local` to load `dist/shaka-player.compiled.js`.

Build that bundle from the checkout root with:

```sh
npm ci
python3 build/build.py --name compiled +@complete -@ui
python3 -m http.server 8080 --bind 127.0.0.1
```

Then open
`http://localhost:8080/test/test/assets/cbcs-subsamples/?bundle=local`.

## Public test key

All key material here is intentionally public and synthetic:

- KID: `000102030405060708090a0b0c0d0e0f`
- Key: `00112233445566778899aabbccddeeff`
- Constant IV: `000102030405060708090a0b0c0d0e0f`
- CBCS pattern: 1 encrypted block, 9 skipped blocks

The HTML configures ClearKey directly. `key.bin` also serves the HLS identity
key URI. These constants must never protect real content.

## Independent verification

With Python 3 and FFmpeg installed:

```sh
python3 verify.py
```

The script parses the actual `senc` entries, verifies multiple protected
ranges, decrypts using FFmpeg, compares every decoded frame hash against the
clear reference, and checks that a wrong key fails. It writes
`verification.json`. The supplied fixture has 48 samples, including 26 samples
with multiple full-block protected ranges and a maximum of 30 ranges in one
sample. Correct decryption produces 48 matching frames.

## Regenerate

Install FFmpeg with the `libsvtav1` encoder and the official
[Shaka Packager v3.9.3](https://github.com/shaka-project/shaka-packager/releases/tag/v3.9.3).
The supplied assets were generated with FFmpeg 9.0.2 and Shaka Packager
v3.9.3. Different encoder versions may produce different bytes and range counts.

```sh
PACKAGER=/path/to/packager ./generate.sh
```

The script creates `testsrc2`, encodes AV1 with four tile columns and two tile
rows, generates clear and CBCS variants, and runs independent verification.
`--clear_lead 0` ensures both segments are encrypted.
`--generate_static_live_mpd` keeps the finite DASH sample playable indefinitely.
Packaging uses a fixed clock; the temporary encoded source is removed after generation.

## Provenance

The media consists only of the FFmpeg-generated `testsrc2` pattern. The sample
and reproduction helpers use this repository's Apache-2.0 license. Shaka
Packager and FFmpeg retain their respective licenses and are not redistributed
in this fixture.
