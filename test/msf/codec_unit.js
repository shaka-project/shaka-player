/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.QuicVarIntCodec', isMSFSupported, () => {
  /** @type {!shaka.msf.QuicVarIntCodec} */
  let codec;

  beforeEach(() => {
    codec = new shaka.msf.QuicVarIntCodec();
  });

  /**
   * @param {bigint} value
   * @return {!Uint8Array}
   */
  function encode(value) {
    const writer = new shaka.util.DataViewWriter(
        16, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    codec.encodeVarInt(writer, value);
    return writer.getBytes();
  }

  describe('encodeVarInt', () => {
    it('should use the shortest encoding for each range', () => {
      expect(encode(BigInt(0))).toEqual(new Uint8Array([0x00]));
      expect(encode(BigInt(0x3f))).toEqual(new Uint8Array([0x3f]));
      expect(encode(BigInt(0x40))).toEqual(new Uint8Array([0x40, 0x40]));
      expect(encode(BigInt(0x3fff))).toEqual(new Uint8Array([0x7f, 0xff]));
      expect(encode(BigInt(0x4000)))
          .toEqual(new Uint8Array([0x80, 0x00, 0x40, 0x00]));
      expect(encode(BigInt(0x3fffffff)))
          .toEqual(new Uint8Array([0xbf, 0xff, 0xff, 0xff]));
      expect(encode(BigInt(0x40000000))).toEqual(
          new Uint8Array([0xc0, 0, 0, 0, 0x40, 0, 0, 0]));
    });

    it('should reject negative values', () => {
      expect(() => encode(BigInt(-1))).toThrow();
    });

    it('should reject values beyond 62 bits', () => {
      expect(() => encode(BigInt('0x4000000000000000'))).toThrow();
    });
  });

  describe('round trip', () => {
    // These are strings rather than bigints because this list is built when
    // the file loads, before filterDescribe can skip us on platforms without
    // BigInt.
    // 0x20000000 through 0x3fffffff sit in the top half of the 4-byte range,
    // where an over-narrow mask on the first byte silently drops bit 29.
    const values = [
      '0x0',
      '0x1',
      '0x3f',
      '0x40',
      '0x3fff',
      '0x4000',
      '0x1fffffff',
      '0x20000000',
      '0x2abcdef0',
      '0x3fffffff',
      '0x40000000',
      '0x1fffffffffffff',  // Number.MAX_SAFE_INTEGER
      '0x0fffffffffffffff',
      '0x1000000000000000',
      '0x3fffffffffffffff',
    ];

    for (const stringValue of values) {
      it(`should round trip ${stringValue}`, () => {
        const value = BigInt(stringValue);
        const bytes = encode(value);
        expect(codec.varIntLength(bytes[0])).toBe(bytes.byteLength);
        expect(codec.decodeVarInt(bytes)).toBe(value);
      });
    }
  });

  describe('decodeVarIntAt', () => {
    it('should decode consecutive values and report their sizes', () => {
      const bytes = new Uint8Array([
        0x05, // 1-byte value 5
        0x7f, 0xff, // 2-byte value 0x3fff
        0x09, // 1-byte value 9
      ]);

      let offset = 0;
      const first = codec.decodeVarIntAt(bytes, offset);
      expect(first.value).toBe(BigInt(5));
      expect(first.bytesRead).toBe(1);
      offset += first.bytesRead;

      const second = codec.decodeVarIntAt(bytes, offset);
      expect(second.value).toBe(BigInt(0x3fff));
      expect(second.bytesRead).toBe(2);
      offset += second.bytesRead;

      const third = codec.decodeVarIntAt(bytes, offset);
      expect(third.value).toBe(BigInt(9));
      expect(third.bytesRead).toBe(1);
    });
  });
});
