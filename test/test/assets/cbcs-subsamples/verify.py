#!/usr/bin/env python3
"""Verify the fixture using Python's standard library and FFmpeg."""
from pathlib import Path
import hashlib
import json
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
KEY = '00112233445566778899aabbccddeeff'  # Public synthetic test key.


def boxes(data, start=0, end=None):
    end = len(data) if end is None else end
    while start < end:
        size, kind = struct.unpack_from('>I4s', data, start)
        if size < 8 or start + size > end:
            raise ValueError('Invalid MP4 box')
        yield start, size, kind
        start += size


def protected_counts(data):
    counts = []
    for start, size, kind in boxes(data):
        if kind in (b'moof', b'traf'):
            counts.extend(protected_counts(data[start + 8:start + size]))
        elif kind == b'senc':
            flags, sample_count = struct.unpack_from('>II', data, start + 8)
            assert flags & 2, 'Expected subsample encryption'
            offset = start + 16  # Constant IV in tenc, no per-sample IV.
            for _ in range(sample_count):
                count = struct.unpack_from('>H', data, offset)[0]
                offset += 2
                protected = 0
                for _ in range(count):
                    _, encrypted_bytes = struct.unpack_from('>HI', data, offset)
                    offset += 6
                    protected += encrypted_bytes >= 16
                counts.append(protected)
            assert offset == start + size
    return counts


def decode(path, key=None):
    command = ['ffmpeg', '-v', 'error', '-xerror']
    if key is not None:
        command += ['-decryption_key', key]
    command += ['-i', str(path), '-map', '0:v', '-f', 'framemd5', '-']
    return subprocess.run(command, capture_output=True, check=False)


counts = []
for path in sorted((ROOT / 'cbcs').glob('segment-*.m4s')):
    counts.extend(protected_counts(path.read_bytes()))
assert counts and max(counts) >= 2, 'Fixture must exercise multiple protected ranges'
with tempfile.TemporaryDirectory() as directory:
    outputs = {}
    for mode in ('clear', 'cbcs'):
        manifest = ET.parse(ROOT / mode / 'manifest.mpd').getroot()
        assert manifest.attrib['type'] == 'static', 'DASH fixture must remain VOD'
        data = (ROOT / mode / 'init.mp4').read_bytes()
        data += b''.join(path.read_bytes() for path in
                         sorted((ROOT / mode).glob('segment-*.m4s')))
        path = Path(directory) / (mode + '.mp4')
        path.write_bytes(data)
        result = decode(path, KEY if mode == 'cbcs' else None)
        assert result.returncode == 0, result.stderr.decode()
        assert not result.stderr
        outputs[mode] = result.stdout
        if mode == 'cbcs':
            wrong = decode(path, 'ff' * 16)
            assert wrong.returncode != 0, 'Wrong-key control should fail'
    assert outputs['clear'] == outputs['cbcs'], 'Decrypted frame hashes differ'

result = {
    'dash_manifest_type': 'static',
    'samples': len(counts),
    'samples_with_multiple_protected_ranges': sum(count >= 2 for count in counts),
    'max_protected_ranges_per_sample': max(counts),
    'decoded_frames': sum(not line.startswith(b'#') and bool(line)
                          for line in outputs['clear'].splitlines()),
    'clear_matches_independently_decrypted_cbcs': True,
    'framemd5_sha256': hashlib.sha256(outputs['clear']).hexdigest(),
    'wrong_key_decode_exit': wrong.returncode,
}
(ROOT / 'verification.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result, indent=2))
