/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Opus', () => {
  const Opus = shaka.codec.Opus;
  // 'OpusHead'.
  const magic = [0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64];

  describe('getDops', () => {
    it('converts an OpusHead to big endian', () => {
      const head = new Uint8Array([
        ...magic,
        // Version, channels, pre-skip (312), input rate (48000), gain (-256),
        // channel mapping family.
        1, 2, 0x38, 0x01, 0x80, 0xbb, 0x00, 0x00, 0x00, 0xff, 0,
      ]);
      expect(Array.from(Opus.getDops(head))).toEqual([
        // Version 0, channels.
        0, 2,
        0x01, 0x38,
        0x00, 0x00, 0xbb, 0x80,
        0xff, 0x00,
        0,
      ]);
    });

    it('keeps the channel mapping table', () => {
      const head = new Uint8Array([
        ...magic,
        1, 6, 0x00, 0x00, 0x80, 0xbb, 0x00, 0x00, 0x00, 0x00, 1,
        // Streams, coupled streams and the mapping of the 6 channels.
        4, 2, 0, 4, 1, 2, 3, 5,
      ]);
      expect(Array.from(Opus.getDops(head).subarray(10))).toEqual(
          [1, 4, 2, 0, 4, 1, 2, 3, 5]);
    });

    it('accepts a head that is a view of a larger buffer', () => {
      const buffer = new Uint8Array(40).fill(0xee);
      buffer.set([...magic, 1, 2, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0], 7);
      expect(Array.from(Opus.getDops(buffer.subarray(7, 26)))).toEqual(
          [0, 2, 0x01, 0x38, 0x00, 0x00, 0xbb, 0x80, 0, 0, 0]);
    });
  });

  describe('makeHead', () => {
    it('writes an OpusHead without a channel mapping table', () => {
      expect(Array.from(Opus.makeHead(1, 312))).toEqual([
        ...magic, 1, 1, 0x38, 0x01, 0x80, 0xbb, 0, 0, 0, 0, 0,
      ]);
    });
  });
});
