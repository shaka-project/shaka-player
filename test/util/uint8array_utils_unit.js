/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Uint8ArrayUtils', () => {
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  describe('concat', () => {
    it('concatenates two buffers', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      expect(Uint8ArrayUtils.concat(a, b))
          .toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('concatenates three buffers', () => {
      const a = new Uint8Array([1]);
      const b = new Uint8Array([2]);
      const c = new Uint8Array([3]);
      expect(Uint8ArrayUtils.concat(a, b, c))
          .toEqual(new Uint8Array([1, 2, 3]));
    });

    it('handles empty buffers', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([]);
      const c = new Uint8Array([3]);
      expect(Uint8ArrayUtils.concat(a, b, c))
          .toEqual(new Uint8Array([1, 2, 3]));
    });

    it('returns empty array when called with no args', () => {
      expect(Uint8ArrayUtils.concat()).toEqual(new Uint8Array([]));
    });

    it('accepts ArrayBuffer inputs', () => {
      const a = shaka.util.BufferUtils.toArrayBuffer(new Uint8Array([1, 2]));
      const b = shaka.util.BufferUtils.toArrayBuffer(new Uint8Array([3, 4]));
      expect(Uint8ArrayUtils.concat(a, b))
          .toEqual(new Uint8Array([1, 2, 3, 4]));
    });
  });

  describe('concatRange', () => {
    it('concatenates the full array by default', () => {
      const arr = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
      expect(Uint8ArrayUtils.concatRange(arr))
          .toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('concatenates a middle range', () => {
      const arr = [
        new Uint8Array([1, 2]),
        new Uint8Array([3, 4]),
        new Uint8Array([5, 6]),
      ];
      expect(Uint8ArrayUtils.concatRange(arr, 1, 2))
          .toEqual(new Uint8Array([3, 4]));
    });

    it('concatenates from start with explicit end', () => {
      const arr = [
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
      ];
      expect(Uint8ArrayUtils.concatRange(arr, 0, 2))
          .toEqual(new Uint8Array([1, 2]));
    });

    it('concatenates from explicit start to end of array', () => {
      const arr = [
        new Uint8Array([1]),
        new Uint8Array([2]),
        new Uint8Array([3]),
      ];
      expect(Uint8ArrayUtils.concatRange(arr, 1))
          .toEqual(new Uint8Array([2, 3]));
    });

    it('returns empty array for empty range', () => {
      const arr = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
      expect(Uint8ArrayUtils.concatRange(arr, 1, 1))
          .toEqual(new Uint8Array([]));
    });

    it('returns empty array for empty input', () => {
      expect(Uint8ArrayUtils.concatRange([])).toEqual(new Uint8Array([]));
    });
  });

  describe('removeEmulationPreventionBytes', () => {
    const removeEmu = (/** @type {!Array<number>} */ arr) =>
      Uint8ArrayUtils.removeEmulationPreventionBytes(new Uint8Array(arr));

    it('removes a single emulation prevention byte', () => {
      // 0x00, 0x00, 0x03 -> the 0x03 is dropped.
      expect(removeEmu([0x00, 0x00, 0x03]))
          .toEqual(new Uint8Array([0x00, 0x00]));
    });

    it('returns a new array without mutating the input', () => {
      // Chromium VDA is strict about NAL unit length, so the result must be a
      // freshly built array (correct, shortened length) and the input must be
      // left untouched rather than having its bytes shifted in place.
      const input = new Uint8Array([0x00, 0x00, 0x03]);
      const result = Uint8ArrayUtils.removeEmulationPreventionBytes(input);
      expect(result).toEqual(new Uint8Array([0x00, 0x00]));
      expect(input).toEqual(new Uint8Array([0x00, 0x00, 0x03]));
    });

    it('removes consecutive emulation prevention bytes', () => {
      expect(removeEmu([0x00, 0x00, 0x03, 0x00, 0x00, 0x03]))
          .toEqual(new Uint8Array([0x00, 0x00, 0x00, 0x00]));
    });

    it('removes an emulation prevention byte after three zeros', () => {
      expect(removeEmu([0x00, 0x00, 0x00, 0x03]))
          .toEqual(new Uint8Array([0x00, 0x00, 0x00]));
    });

    it('keeps a 0x03 not preceded by two zeros', () => {
      expect(removeEmu([0x00, 0x03])).toEqual(new Uint8Array([0x00, 0x03]));
      expect(removeEmu([0x01, 0x00, 0x03]))
          .toEqual(new Uint8Array([0x01, 0x00, 0x03]));
    });

    it('keeps data without emulation prevention bytes', () => {
      expect(removeEmu([0x01, 0x02, 0x03, 0x04]))
          .toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
    });

    it('handles a mix of escaped and unescaped bytes', () => {
      // 0x00 0x00 0x03 (escaped) then 0x01, then 0x00 0x00 0x03 0x04 (escaped).
      expect(removeEmu([0x00, 0x00, 0x03, 0x01, 0x00, 0x00, 0x03, 0x04]))
          .toEqual(new Uint8Array([0x00, 0x00, 0x01, 0x00, 0x00, 0x04]));
    });

    it('handles empty input', () => {
      expect(removeEmu([])).toEqual(new Uint8Array([]));
    });
  });
});
