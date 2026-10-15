/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MpegAudio', () => {
  const MpegAudio = shaka.codec.MpegAudio;

  it('parses a MPEG-1 Layer II header', () => {
    const data = new Uint8Array([0xff, 0xfc, 0xc4, 0x00]);
    const header = MpegAudio.parseHeader(data, 0);
    expect(header).toEqual({
      sampleRate: 48000,
      channelCount: 2,
      frameLength: 768,
      samplesPerFrame: 1152,
    });
  });

  it('rejects data without a sync word', () => {
    // These bytes appear between frames in real MPEG audio streams. Without a
    // sync word check they look like a header of a reserved layer, whose frame
    // length is 0, which made the transmuxers loop forever. See #10419.
    const data = new Uint8Array([0x7c, 0xf9, 0xb8, 0xdc]);
    expect(MpegAudio.parseHeader(data, 0)).toBe(null);
    expect(MpegAudio.isHeader(data, 0)).toBe(false);
    expect(MpegAudio.probe(data, 0)).toBe(false);
  });

  it('never returns a header with an empty frame length', () => {
    // Exhaustively check every possible header, so that no input can make a
    // caller advance by 0 bytes.
    const data = new Uint8Array(4);
    data[0] = 0xff;
    for (let b1 = 0xe0; b1 <= 0xff; b1++) {
      data[1] = b1;
      for (let b2 = 0; b2 <= 0xff; b2++) {
        data[2] = b2;
        for (let b3 = 0; b3 <= 0xff; b3 += 0x40) {
          data[3] = b3;
          const header = MpegAudio.parseHeader(data, 0);
          if (header) {
            expect(header.frameLength).toBeGreaterThan(0);
            expect(header.samplesPerFrame).toBeGreaterThan(0);
            expect(header.sampleRate).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('gives the codec of MPEG audio in MP4 by the sample rate', () => {
    // MPEG-1 audio has the high rates, and MPEG-2 the low ones.
    expect(MpegAudio.getMp4Codec(48000)).toBe('mp4a.6B');
    expect(MpegAudio.getMp4Codec(32000)).toBe('mp4a.6B');
    expect(MpegAudio.getMp4Codec(24000)).toBe('mp4a.69');
    expect(MpegAudio.getMp4Codec(22050)).toBe('mp4a.69');
  });

  it('builds the esds of MPEG audio without DecoderSpecificInfo', () => {
    // Version and flags, ES_Descriptor (ES_ID 0, no flags),
    // DecoderConfigDescriptor (MPEG-1 audio, audio stream, buffer size,
    // maximum and average bitrate) and SLConfigDescriptor.
    expect(Array.from(MpegAudio.buildEsds(44100))).toEqual([
      0, 0, 0, 0,
      0x03, 0x15, 0, 0, 0,
      0x04, 0x0D, 0x6B, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0x06, 0x01, 0x02,
    ]);
    expect(MpegAudio.buildEsds(22050)[11]).toBe(0x69);
  });
});
