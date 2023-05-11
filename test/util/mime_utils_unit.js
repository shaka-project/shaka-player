/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MimeUtils', () => {
  const getNormalizedCodec = (codecs) =>
    shaka.util.MimeUtils.getNormalizedCodec(codecs);

  it('normalizes codecs', () => {
    expect(getNormalizedCodec('mp4a.66')).toBe('aac');
    expect(getNormalizedCodec('mp4a.67')).toBe('aac');
    expect(getNormalizedCodec('mp4a.68')).toBe('aac');

    expect(getNormalizedCodec('mp3')).toBe('mp3');
    expect(getNormalizedCodec('mp4a.69')).toBe('mp3');
    expect(getNormalizedCodec('mp4a.6B')).toBe('mp3');
    expect(getNormalizedCodec('mp4a.6b')).toBe('mp3');

    expect(getNormalizedCodec('mp4a.40.2')).toBe('aac');
    expect(getNormalizedCodec('mp4a.40.02')).toBe('aac');
    expect(getNormalizedCodec('mp4a.40.5')).toBe('aac');
    expect(getNormalizedCodec('mp4a.40.05')).toBe('aac');
    expect(getNormalizedCodec('mp4a.40.29')).toBe('aac');
    expect(getNormalizedCodec('mp4a.40.42')).toBe('aac');

    expect(getNormalizedCodec('ac-3')).toBe('ac-3');
    expect(getNormalizedCodec('mp4a.a5')).toBe('ac-3');
    expect(getNormalizedCodec('mp4a.A5')).toBe('ac-3');

    expect(getNormalizedCodec('ec-3')).toBe('ec-3');
    expect(getNormalizedCodec('mp4a.a6')).toBe('ec-3');
    expect(getNormalizedCodec('mp4a.A6')).toBe('ec-3');

    expect(getNormalizedCodec('dtsc')).toBe('dtsc');
    expect(getNormalizedCodec('mp4a.a9')).toBe('dtsc');

    expect(getNormalizedCodec('dtsx')).toBe('dtsx');
    expect(getNormalizedCodec('mp4a.b2')).toBe('dtsx');

    expect(getNormalizedCodec('vp8')).toBe('vp8');
    expect(getNormalizedCodec('vp8.0')).toBe('vp8');

    expect(getNormalizedCodec('avc1')).toBe('avc');
    expect(getNormalizedCodec('avc3')).toBe('avc');

    expect(getNormalizedCodec('hvc1')).toBe('hevc');
    expect(getNormalizedCodec('hev1')).toBe('hevc');

    expect(getNormalizedCodec('dvh1.05')).toBe('dovi');
    expect(getNormalizedCodec('dvhe.05')).toBe('dovi');
  });

  it('isHlsType', () => {
    const isHlsType = (mimeType) => shaka.util.MimeUtils.isHlsType(mimeType);

    expect(isHlsType('application/x-mpegurl')).toBe(true);
    expect(isHlsType('application/vnd.apple.mpegurl')).toBe(true);
    expect(isHlsType('application/dash+xml')).toBe(false);
    expect(isHlsType('application/vnd.ms-sstr+xml')).toBe(false);
    expect(isHlsType('foo')).toBe(false);
  });
});
