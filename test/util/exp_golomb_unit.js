/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ExpGolomb', () => {
  describe('readSliceType', () => {
    // The data given to readSliceType starts at the slice header, that is,
    // just after the 1-byte NAL unit header.  Each of these buffers is the
    // start of a real H.264 slice header.

    it('parses the first slice of an I frame', () => {
      // first_mb_in_slice = 0, slice_type = 7 (I).
      const data = new Uint8Array([0x88, 0x8e, 0x9a, 0x13]);
      const expGolomb = new shaka.util.ExpGolomb(data);
      expect(expGolomb.readSliceType()).toBe(7);
    });

    it('parses the non-first slices of an I frame', () => {
      // Multi-slice pictures have a non-zero first_mb_in_slice, which must not
      // be mistaken for the slice type.  These are slices 2, 3 and 4 of the
      // same I frame as above, with first_mb_in_slice = 108, 216 and 324.
      const slices = [
        new Uint8Array([0x03, 0x68, 0x88, 0xe9]),
        new Uint8Array([0x01, 0xb2, 0x22, 0x3a]),
        new Uint8Array([0x00, 0xa2, 0x88, 0x8e]),
      ];
      for (const data of slices) {
        const expGolomb = new shaka.util.ExpGolomb(data);
        expect(expGolomb.readSliceType()).toBe(7);
      }
    });

    it('parses a P slice', () => {
      // first_mb_in_slice = 0, slice_type = 5 (P).
      const data = new Uint8Array([0x98, 0x00, 0x00, 0x00]);
      const expGolomb = new shaka.util.ExpGolomb(data);
      expect(expGolomb.readSliceType()).toBe(5);
    });

    it('parses a B slice', () => {
      // first_mb_in_slice = 0, slice_type = 6 (B).
      const data = new Uint8Array([0x9c, 0x00, 0x00, 0x00]);
      const expGolomb = new shaka.util.ExpGolomb(data);
      expect(expGolomb.readSliceType()).toBe(6);
    });
  });
});
