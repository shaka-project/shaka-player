/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Flac', () => {
  const Flac = shaka.codec.Flac;

  // 'fLaC'.
  const marker = [0x66, 0x4c, 0x61, 0x43];

  /**
   * The metadata blocks of a stream: a STREAMINFO block, marked as the last.
   *
   * @param {number} minBlockSize
   * @param {number} maxBlockSize
   * @return {!Uint8Array}
   */
  const makeMetadata = (minBlockSize, maxBlockSize) => {
    const bytes = new Uint8Array(4 + 34);
    // Last block, type 0, 34 bytes.
    bytes.set([0x80, 0x00, 0x00, 0x22]);
    const view = shaka.util.BufferUtils.toDataView(bytes);
    view.setUint16(4, minBlockSize);
    view.setUint16(6, maxBlockSize);
    // 48 kHz (20 bits), 6 channels (3 bits: 5), 16 bits per sample (5 bits:
    // 15), and no total.
    bytes.set([0x0b, 0xb8, 0x0a, 0xf0], 14);
    return bytes;
  };

  describe('parseStreamInfo', () => {
    it('reads the sizes, rate, channels and bit depth', () => {
      expect(Flac.parseStreamInfo(makeMetadata(4096, 4096))).toEqual({
        minBlockSize: 4096,
        maxBlockSize: 4096,
        sampleRate: 48000,
        channelCount: 6,
        bitsPerSample: 16,
      });
    });

    it('accepts the fLaC marker in front of the blocks', () => {
      const withMarker = shaka.util.Uint8ArrayUtils.concat(
          new Uint8Array(marker), makeMetadata(4096, 4096));
      expect(Flac.parseStreamInfo(withMarker).sampleRate).toBe(48000);
    });

    it('rejects data that is not a STREAMINFO block', () => {
      const bytes = makeMetadata(4096, 4096);
      // Type 1, PADDING.
      bytes[0] = 0x01;
      expect(Flac.parseStreamInfo(bytes)).toBe(null);
      expect(Flac.parseStreamInfo(new Uint8Array(10))).toBe(null);
    });

    it('rejects a stream with no sample rate', () => {
      const bytes = makeMetadata(4096, 4096);
      bytes.fill(0, 14, 16);
      bytes[16] &= 0x0f;
      expect(Flac.parseStreamInfo(bytes)).toBe(null);
    });
  });

  describe('buildDfLa', () => {
    it('puts the version and the flags before the block', () => {
      const blocks = makeMetadata(4096, 4096);
      const dfLa = Flac.buildDfLa(blocks);
      expect(Array.from(dfLa.subarray(0, 4))).toEqual([0, 0, 0, 0]);
      expect(Array.from(dfLa.subarray(4))).toEqual(Array.from(blocks));
    });

    it('marks the STREAMINFO block as the last', () => {
      const blocks = makeMetadata(4096, 4096);
      // As a muxer that left the other blocks out may write it.
      blocks[0] = 0x00;
      const dfLa = Flac.buildDfLa(blocks);
      expect(dfLa[4]).toBe(0x80);
      // The input is not touched.
      expect(blocks[0]).toBe(0x00);
    });

    it('drops the fLaC marker', () => {
      const blocks = makeMetadata(4096, 4096);
      const withMarker = shaka.util.Uint8ArrayUtils.concat(
          new Uint8Array(marker), blocks);
      expect(Array.from(Flac.buildDfLa(withMarker))).toEqual(
          Array.from(Flac.buildDfLa(blocks)));
    });

    it('drops the blocks that follow STREAMINFO', () => {
      const blocks = shaka.util.Uint8ArrayUtils.concat(
          makeMetadata(4096, 4096),
          // A VORBIS_COMMENT block (type 4) of 4 bytes.
          new Uint8Array([0x84, 0x00, 0x00, 0x04, 1, 2, 3, 4]));
      expect(Flac.buildDfLa(blocks).length).toBe(4 + 4 + 34);
    });
  });

  describe('getBlockSize', () => {
    const fixed = /** @type {!shaka.codec.Flac.StreamInfo} */(
      Flac.parseStreamInfo(makeMetadata(4096, 4096)));
    const variable = /** @type {!shaka.codec.Flac.StreamInfo} */(
      Flac.parseStreamInfo(makeMetadata(16, 4096)));

    /**
     * A frame header with a block size code, followed by the coded number of
     * the frame (a byte) and more bytes.
     *
     * @param {number} code
     * @param {...number} rest
     * @return {!Uint8Array}
     */
    const frame = (code, ...rest) => {
      return new Uint8Array([0xff, 0xf8, (code << 4) | 0x0a, 0x18, ...rest]);
    };

    it('is the block size of a stream that does not change it', () => {
      expect(Flac.getBlockSize(frame(12, 0), fixed)).toBe(4096);
      // Whatever the frame says.
      expect(Flac.getBlockSize(new Uint8Array(2), fixed)).toBe(4096);
    });

    it('reads the sizes that the codes stand for', () => {
      expect(Flac.getBlockSize(frame(1, 0, 0), variable)).toBe(192);
      expect(Flac.getBlockSize(frame(2, 0, 0), variable)).toBe(576);
      expect(Flac.getBlockSize(frame(3, 0, 0), variable)).toBe(1152);
      expect(Flac.getBlockSize(frame(5, 0, 0), variable)).toBe(4608);
      expect(Flac.getBlockSize(frame(8, 0, 0), variable)).toBe(256);
      expect(Flac.getBlockSize(frame(12, 0, 0), variable)).toBe(4096);
      expect(Flac.getBlockSize(frame(15, 0, 0), variable)).toBe(32768);
    });

    it('reads a size written after the header', () => {
      // 8 bits: 16 minus one.
      expect(Flac.getBlockSize(frame(6, 0x00, 0x0f), variable)).toBe(16);
      // 16 bits: 1023 plus one.
      expect(Flac.getBlockSize(frame(7, 0x00, 0x03, 0xff), variable))
          .toBe(1024);
    });

    it('skips a number of the frame that has more than one byte', () => {
      // 0xC2 starts a number of two bytes.
      expect(Flac.getBlockSize(frame(6, 0xc2, 0x80, 0x1f), variable))
          .toBe(32);
    });

    it('falls back to the largest size when the header is not readable', () => {
      expect(Flac.getBlockSize(new Uint8Array([1, 2, 3, 4]), variable))
          .toBe(4096);
      // A size that is written after the header, which is cut.
      expect(Flac.getBlockSize(frame(6, 0x00), variable)).toBe(4096);
    });
  });
});
