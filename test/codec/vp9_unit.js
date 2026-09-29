/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VP9', () => {
  const VP9 = shaka.codec.VP9;

  describe('getCodecs', () => {
    /**
     * @param {number} width
     * @param {number} height
     * @param {number} fps
     * @return {string} The level of the codec string.
     */
    const level = (width, height, fps) => {
      const info = {profile: 0, bitDepth: 8, chroma: 1};
      return VP9.getCodecs(info, width, height, 1 / fps).split('.')[2];
    };

    it('writes the profile, level, bit depth and chroma', () => {
      const info = {profile: 2, bitDepth: 10, chroma: 3};
      expect(VP9.getCodecs(info, 1920, 1080, 1 / 24))
          .toBe('vp09.02.40.10.03');
    });

    it('picks the level for the size and the frame rate', () => {
      expect(level(352, 288, 30)).toBe('20');
      expect(level(1280, 720, 30)).toBe('31');
      expect(level(1920, 1080, 30)).toBe('40');
      // The same picture size, but a rate that needs the next level.
      expect(level(1920, 1080, 60)).toBe('41');
      expect(level(3840, 2160, 30)).toBe('50');
      expect(level(3840, 2160, 60)).toBe('51');
      // Larger than any level: the last one.
      expect(level(16384, 16384, 120)).toBe('62');
    });

    it('assumes a frame rate when it is not known', () => {
      const info = {profile: 0, bitDepth: 8, chroma: 1};
      expect(VP9.getCodecs(info, 1280, 720, null)).toBe('vp09.00.31.08.01');
    });
  });

  describe('buildVpcC', () => {
    it('writes the fields of the short codec string', () => {
      expect(Array.from(VP9.buildVpcC('vp09.02.40.10.03'))).toEqual([
        // Version 1, no flags.
        1, 0, 0, 0,
        // Profile and level.
        2, 40,
        // 10 bits, 4:4:4, limited range.
        (10 << 4) | (3 << 1) | 0,
        // Color primaries, transfer and matrix are unspecified.
        2, 2, 2,
        // No initialization data.
        0, 0,
      ]);
    });

    it('writes the fields of the long codec string', () => {
      expect(Array.from(VP9.buildVpcC('vp09.00.31.08.01.01.01.01.01')))
          .toEqual([1, 0, 0, 0, 0, 31, (8 << 4) | (1 << 1) | 1, 1, 1, 1, 0, 0]);
    });
  });

  describe('parseKeyFrame', () => {
    /**
     * Writes a list of [value, bit count] into bytes, most significant bit
     * first.
     *
     * @param {!Array<!Array<number>>} fields
     * @return {!Uint8Array}
     */
    const writeBits = (fields) => {
      const bits = [];
      for (const [value, count] of fields) {
        for (let i = count - 1; i >= 0; i--) {
          bits.push((value >> i) & 1);
        }
      }
      const bytes = new Uint8Array(Math.ceil(bits.length / 8) + 4);
      bits.forEach((bit, i) => {
        bytes[i >> 3] |= bit << (7 - (i & 7));
      });
      return bytes;
    };

    const SYNC_CODE = [0x498342, 24];

    it('reads a profile 0 key frame', () => {
      const frame = writeBits([
        // Marker, profile low and high bits, show_existing_frame, frame_type
        // (key frame), show_frame, error_resilient_mode.
        [2, 2], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        SYNC_CODE,
        // Color space BT.709, limited range.
        [2, 3], [0, 1],
        // Width and height minus one.
        [1279, 16], [719, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toEqual({
        profile: 0, bitDepth: 8, chroma: 1, width: 1280, height: 720,
      });
    });

    it('reads a profile 2 key frame with 10 bits', () => {
      const frame = writeBits([
        // Profile 2: low bit 0, high bit 1.
        [2, 2], [0, 1], [1, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        SYNC_CODE,
        // 10 bits (the "twelve" bit is off).
        [0, 1],
        [2, 3], [0, 1],
        [3839, 16], [2159, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toEqual({
        profile: 2, bitDepth: 10, chroma: 1, width: 3840, height: 2160,
      });
    });

    it('reads a profile 1 key frame with 4:4:4', () => {
      const frame = writeBits([
        // Profile 1: low bit 1, high bit 0.
        [2, 2], [1, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        SYNC_CODE,
        // Color space, range, no subsampling (x, y) and a reserved bit.
        [2, 3], [0, 1], [0, 1], [0, 1], [0, 1],
        [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toEqual({
        profile: 1, bitDepth: 8, chroma: 3, width: 64, height: 64,
      });
    });

    it('reads a profile 3 key frame, which has a reserved bit', () => {
      const frame = writeBits([
        // Profile 3, then the reserved bit.
        [2, 2], [1, 1], [1, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        SYNC_CODE,
        // 12 bits.
        [1, 1],
        [2, 3], [0, 1],
        // 4:2:2: x subsampled, y not, and a reserved bit.
        [1, 1], [0, 1], [0, 1],
        [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toEqual({
        profile: 3, bitDepth: 12, chroma: 2, width: 64, height: 64,
      });
    });

    it('rejects a frame that is not a key frame', () => {
      const frame = writeBits([
        // frame_type 1.
        [2, 2], [0, 1], [0, 1], [0, 1], [1, 1], [1, 1], [0, 1],
        SYNC_CODE,
        [2, 3], [0, 1], [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toBe(null);
    });

    it('rejects a frame that repeats another', () => {
      const frame = writeBits([
        // show_existing_frame.
        [2, 2], [0, 1], [0, 1], [1, 1], [0, 3],
        SYNC_CODE,
        [2, 3], [0, 1], [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(frame)).toBe(null);
    });

    it('rejects a wrong frame marker and a wrong sync code', () => {
      const marker = writeBits([
        [1, 2], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        SYNC_CODE, [2, 3], [0, 1], [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(marker)).toBe(null);
      const sync = writeBits([
        [2, 2], [0, 1], [0, 1], [0, 1], [0, 1], [1, 1], [0, 1],
        [0x123456, 24], [2, 3], [0, 1], [63, 16], [63, 16],
      ]);
      expect(VP9.parseKeyFrame(sync)).toBe(null);
    });

    it('rejects a frame that is too short', () => {
      expect(VP9.parseKeyFrame(new Uint8Array(4))).toBe(null);
    });
  });
});
