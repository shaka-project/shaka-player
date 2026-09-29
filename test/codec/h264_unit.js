/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('H264', () => {
  describe('getCodecs', () => {
    it('gives the profile, constraints and level from avcC', () => {
      // Version 1, High profile, no constraints, level 3.1.
      const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
      expect(shaka.codec.H264.getCodecs(avcC)).toBe('avc1.64001f');
    });

    it('keeps the leading zeros', () => {
      const avcC = new Uint8Array([1, 0x42, 0xc0, 0x0a, 0xff, 0xe1]);
      expect(shaka.codec.H264.getCodecs(avcC)).toBe('avc1.42c00a');
    });
  });
});
