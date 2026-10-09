#!/usr/bin/env python3
# Copyright 2016 Google LLC
# SPDX-License-Identifier: Apache-2.0
"""Generate original, synthetic MKV playback fixtures with FFmpeg.

Run from any directory. Requires FFmpeg with libx264, libx265, libsvtav1,
libvpx, libopus and libmp3lame. No downloaded media is used.
"""

from pathlib import Path
import subprocess
import tempfile

OUTPUT = Path(__file__).resolve().parent
VIDEOS = {
    'avc': ['libx264', '-profile:v', 'main', '-bf', '2'],
    'hevc': ['libx265', '-x265-params', 'log-level=error:pools=1'],
    'av1': ['libsvtav1', '-preset', '12', '-svtav1-params', 'lp=1'],
    'vp9': ['libvpx-vp9', '-deadline', 'realtime', '-cpu-used', '8'],
    'vp8': ['libvpx', '-deadline', 'realtime', '-cpu-used', '8'],
}
AUDIOS = {
    'aac': ['aac'], 'ac3': ['ac3'], 'eac3': ['eac3'],
    'opus': ['libopus'], 'mp3': ['libmp3lame'], 'flac': ['flac'],
    'vorbis': ['vorbis', '-strict', 'experimental'],
}
PAIRS = [
    ('avc', 'aac', 'srt'), ('hevc', 'eac3', 'ass'),
    ('av1', 'opus', 'srt'), ('vp9', 'flac', 'ass'),
    ('vp8', 'vorbis', 'srt'), ('avc', 'ac3', 'ass'),
    ('avc', 'mp3', 'srt'), ('vp8', 'aac', 'ass'),
    ('avc', 'vorbis', 'srt'), ('avc', 'aac', 'ascii'),
    ('avc', 'aac', 'ssa'),
]


def run(args, name):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y'] +
                   args + ['-t', '4', '-cluster_time_limit', '1000',
                           '-write_crc32', '0',
                           str(OUTPUT / (name + '.mkv'))], check=True)


def main():
    for name, options in VIDEOS.items():
        run(['-f', 'lavfi', '-i', 'testsrc2=size=160x128:rate=12',
             '-an', '-c:v'] + options +
            ['-pix_fmt', 'yuv420p', '-g', '12', '-threads', '1'], name)
    for name, options in AUDIOS.items():
        run(['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
             '-vn', '-ac', '2', '-c:a'] + options +
            ['-metadata:s:a:0', 'language=eng'], name)
    with tempfile.TemporaryDirectory() as temporary:
        directory = Path(temporary)
        subtitles = directory / 'captions.srt'
        subtitles.write_text(
            '1\n00:00:00,500 --> 00:00:01,500\nFirst caption\n\n'
            '2\n00:00:02,000 --> 00:00:03,500\nSecond caption\n',
            encoding='utf-8')
        chapters = directory / 'chapters.txt'
        chapters.write_text(
            ';FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\n'
            'START=0\nEND=2000\ntitle=Opening\n'
            '[CHAPTER]\nTIMEBASE=1/1000\n'
            'START=2000\nEND=4000\ntitle=Ending\n', encoding='utf-8')
        ssa = directory / 'captions.ssa'
        ssa.write_text(
            '[Script Info]\nScriptType: v4.00\n'
            '[V4 Styles]\n'
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, '
            'TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, '
            'Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, Encoding\n'
            'Style: Default,Arial,20,16777215,16777215,0,0,0,0,1,1,0,2,'
            '10,10,10,0,1\n'
            '[Events]\nFormat: Marked, Start, End, Style, Name, MarginL, '
            'MarginR, MarginV, Effect, Text\n'
            'Dialogue: Marked=0,0:00:00.50,0:00:01.50,Default,,0,0,0,,'
            'First caption\n'
            'Dialogue: Marked=0,0:00:02.00,0:00:03.50,Default,,0,0,0,,'
            'Second caption\n', encoding='ascii')
        for video, audio, text in PAIRS:
            run(['-i', str(OUTPUT / (video + '.mkv')),
                 '-i', str(OUTPUT / (audio + '.mkv')),
                 '-i', str(ssa if text == 'ssa' else subtitles), '-f', 'ffmetadata', '-i', str(chapters),
                 '-map', '0:v', '-map', '1:a', '-map', '2:s',
                 '-map_chapters', '3', '-c', 'copy', '-c:s',
                 {'ascii': 'srt', 'ssa': 'copy'}.get(text, text),
                 '-metadata:s:s:0', 'title=Captions',
                 '-metadata:s:s:0', 'language=eng'],
                '-'.join((video, audio, text)))
            output = OUTPUT / ('-'.join((video, audio, text)) + '.mkv')
            if text == 'ascii':
                # FFmpeg writes UTF8. ASCII uses the same ASCII-only payload.
                # Grow CodecID by one byte and shrink TrackName by one byte;
                # the TrackEntry size and all seek offsets remain unchanged.
                data = output.read_bytes()
                assert data.count(b'\x86\x8bS_TEXT/UTF8') == 1
                assert data.count(b'\x53\x6e\x88Captions') == 1
                data = data.replace(b'\x86\x8bS_TEXT/UTF8',
                                    b'\x86\x8cS_TEXT/ASCII')
                data = data.replace(b'\x53\x6e\x88Captions',
                                    b'\x53\x6e\x87Caption')
                output.write_bytes(data)
            elif text == 'ssa':
                # Preserve the original SSA header and packets, and correct
                # the codec identifier FFmpeg writes for both ASS and SSA.
                data = output.read_bytes()
                assert data.count(b'S_TEXT/ASS') == 1
                output.write_bytes(data.replace(b'S_TEXT/ASS', b'S_TEXT/SSA'))


if __name__ == '__main__':
    main()
