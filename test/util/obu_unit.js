/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Obu', () => {
  const Obu = shaka.util.Obu;

  /**
   * @param {...!Uint8Array} parts
   * @return {!Uint8Array}
   */
  function concat(...parts) {
    return shaka.util.Uint8ArrayUtils.concat(...parts);
  }

  describe('readLeb128', () => {
    it('reads a single-byte value', () => {
      expect(Obu.readLeb128(new Uint8Array([0x00]), 0))
          .toEqual({value: 0, size: 1});
      expect(Obu.readLeb128(new Uint8Array([0x7f]), 0))
          .toEqual({value: 127, size: 1});
    });

    it('reads a multi-byte value, low-order group first', () => {
      // 0xc0 0x07 -> 0x40 | (0x07 << 7) = 960.
      expect(Obu.readLeb128(new Uint8Array([0xc0, 0x07]), 0))
          .toEqual({value: 960, size: 2});
    });

    it('reads a value wider than 32 bits', () => {
      // Seven groups of 7 bits, all set: 2^49 - 1.
      const data = new Uint8Array(
          [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f]);
      expect(Obu.readLeb128(data, 0))
          .toEqual({value: Math.pow(2, 49) - 1, size: 7});
    });

    it('reads from an offset', () => {
      expect(Obu.readLeb128(new Uint8Array([0xaa, 0xbb, 0x05]), 2))
          .toEqual({value: 5, size: 1});
    });

    it('returns null when the value is truncated', () => {
      // Every byte asks for another one, and then the data runs out.
      expect(Obu.readLeb128(new Uint8Array([0x80, 0x80]), 0)).toBeNull();
      expect(Obu.readLeb128(new Uint8Array([]), 0)).toBeNull();
      expect(Obu.readLeb128(new Uint8Array([0x05]), 1)).toBeNull();
    });

    it('returns null for more than eight bytes', () => {
      const data = new Uint8Array(
          [0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0x00]);
      expect(Obu.readLeb128(data, 0)).toBeNull();
    });
  });

  describe('parseAv1', () => {
    /**
     * The sequence header OBU of moqlivemock's
     * assets/test10s/video_600kbps_av1.mp4, copied out of the first coded key
     * frame: 1280x720, profile 0 (Main), level 5, 8-bit, 4:2:0.
     *
     * Header byte 0x0a is obu_type=1 (OBU_SEQUENCE_HEADER) with
     * obu_has_size_field=1, and 0x0b is the 11-byte payload size.
     *
     * @const {!Uint8Array}
     */
    const sequenceHeaderObu = new Uint8Array([
      0x0a, 0x0b,
      0x00, 0x00, 0x00, 0x2d, 0x4c, 0xff, 0xb3, 0xc6, 0xaf, 0x98, 0x04,
    ]);

    // 0x32: obu_type=6 (OBU_FRAME), obu_has_size_field=1.
    const frameObu = new Uint8Array([0x32, 0x03, 0x10, 0x00, 0x96]);

    it('splits a temporal unit into its OBUs', () => {
      const obus = Obu.parseAv1(concat(sequenceHeaderObu, frameObu));

      expect(obus.length).toBe(2);
      expect(obus[0].type).toBe(1);
      expect(obus[0].data.byteLength).toBe(11);
      expect(obus[0].fullData).toEqual(sequenceHeaderObu);
      expect(obus[1].type).toBe(6);
      expect(obus[1].data.byteLength).toBe(3);
    });

    it('skips the extension byte', () => {
      // 0x0e adds obu_extension_flag to the sequence header type, so a
      // temporal_id/spatial_id byte precedes the size field.
      const extended = concat(
          new Uint8Array([0x0e, 0x00, 0x0b]), sequenceHeaderObu.subarray(2));

      const obus = Obu.parseAv1(extended);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(1);
      expect(obus[0].data).toEqual(sequenceHeaderObu.subarray(2));
    });

    it('runs an OBU with no size field to the end of the unit', () => {
      // 0x08 clears obu_has_size_field, which only the last OBU may do.
      const unsized =
          concat(new Uint8Array([0x08]), sequenceHeaderObu.subarray(2));

      const obus = Obu.parseAv1(unsized);
      expect(obus.length).toBe(1);
      expect(obus[0].data.byteLength).toBe(11);
    });

    it('reads a multi-byte leb128 size', () => {
      const payload = new Uint8Array(200);
      // 200 = 0xc8 -> leb128 0xc8 0x01.
      const obus =
          Obu.parseAv1(concat(new Uint8Array([0x32, 0xc8, 0x01]), payload));

      expect(obus.length).toBe(1);
      expect(obus[0].data.byteLength).toBe(200);
    });

    it('stops at an OBU that runs past the end of the unit', () => {
      const truncated =
          concat(sequenceHeaderObu, new Uint8Array([0x32, 0x40, 0x10]));

      const obus = Obu.parseAv1(truncated);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(1);
    });

    it('stops when obu_forbidden_bit is set', () => {
      const obus = Obu.parseAv1(
          concat(sequenceHeaderObu, new Uint8Array([0x80, 0x00])));

      expect(obus.length).toBe(1);
    });

    it('returns nothing for an empty unit', () => {
      expect(Obu.parseAv1(new Uint8Array([]))).toEqual([]);
    });
  });

  describe('parseIamf', () => {
    // obu_type=31 (OBU_IA_Sequence_Header), no flags, 6-byte payload.
    const sequenceHeaderObu = new Uint8Array([
      0xf8, 0x06,
      0x69, 0x61, 0x6d, 0x66, // ia_code ('iamf')
      0x00, 0x00, // profiles
    ]);

    // obu_type=0 (OBU_IA_Codec_Config), no flags, 5-byte payload.
    const codecConfigObu = new Uint8Array([
      0x00, 0x05,
      0x00, // codec_config_id
      0x4f, 0x70, 0x75, 0x73, // codec_id ('Opus')
    ]);

    it('splits a sequence of OBUs', () => {
      const obus = Obu.parseIamf(concat(sequenceHeaderObu, codecConfigObu));

      expect(obus.length).toBe(2);
      expect(obus[0].type).toBe(31);
      expect(obus[0].data).toEqual(sequenceHeaderObu.subarray(2));
      expect(obus[0].fullData).toEqual(sequenceHeaderObu);
      expect(obus[1].type).toBe(0);
      expect(obus[1].data.byteLength).toBe(5);
    });

    it('skips the trimming fields, which obu_size covers', () => {
      // obu_type=5 (OBU_IA_Audio_Frame) with obu_trimming_status_flag, and an
      // obu_size of 4 that covers both trimming values plus the payload.
      const audioFrame = new Uint8Array([
        (5 << 3) | 0x02, 0x04,
        0x00, // num_samples_to_trim_at_end
        0x80, 0x01, // num_samples_to_trim_at_start (128)
        0xaa, // payload
      ]);

      const obus = Obu.parseIamf(audioFrame);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(5);
      expect(obus[0].data).toEqual(new Uint8Array([0xaa]));
    });

    it('skips the extension header, which obu_size covers', () => {
      const extended = new Uint8Array([
        (31 << 3) | 0x01, 0x09,
        0x02, // extension_header_size
        0xaa, 0xbb, // extension_header_bytes
        0x69, 0x61, 0x6d, 0x66, // ia_code ('iamf')
        0x01, 0x02, // profiles
      ]);

      const obus = Obu.parseIamf(extended);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(31);
      expect(obus[0].data)
          .toEqual(new Uint8Array([0x69, 0x61, 0x6d, 0x66, 0x01, 0x02]));
    });

    it('keeps reserved OBUs, so callers can skip them by type', () => {
      const reserved = new Uint8Array([24 << 3, 0x02, 0x01, 0x02]);

      const obus =
          Obu.parseIamf(concat(sequenceHeaderObu, reserved, codecConfigObu));
      expect(obus.map((obu) => obu.type)).toEqual([31, 24, 0]);
    });

    it('reads a multi-byte leb128 size', () => {
      const payload = new Uint8Array(200);
      const obus = Obu.parseIamf(
          concat(new Uint8Array([0x00, 0xc8, 0x01]), payload));

      expect(obus.length).toBe(1);
      expect(obus[0].data.byteLength).toBe(200);
    });

    it('stops at an OBU that runs past the end of the data', () => {
      const truncated =
          concat(sequenceHeaderObu, new Uint8Array([0x00, 0x40, 0x10]));

      const obus = Obu.parseIamf(truncated);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(31);
    });

    it('stops when the optional fields overrun their own OBU', () => {
      // obu_size is 1, which cannot hold the two trimming values it claims.
      const bad = new Uint8Array([(5 << 3) | 0x02, 0x01, 0x00, 0x00]);

      expect(Obu.parseIamf(bad)).toEqual([]);
    });

    it('returns nothing for empty data', () => {
      expect(Obu.parseIamf(new Uint8Array([]))).toEqual([]);
    });
  });
});
