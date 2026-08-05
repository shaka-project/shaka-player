/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.draft18.Codec', isMSFSupported, () => {
  /** @type {!shaka.msf.draft18.Codec} */
  let codec;

  beforeEach(() => {
    codec = new shaka.msf.draft18.Codec();
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

  /**
   * @param {string} hex
   * @return {!Uint8Array}
   */
  function bytes(hex) {
    return new Uint8Array(
        hex.split(' ').map((byte) => parseInt(byte, 16)));
  }

  describe('decodeVarInt', () => {
    // The example encodings from draft-18 section 1.4.1, table 2.
    const vectors = [
      ['25', BigInt(37)],
      ['80 25', BigInt(37)],
      ['bb bd', BigInt(15293)],
      ['ed 7f 3e 7d', BigInt(226442877)],
      ['fa a1 a0 e4 03 d8', BigInt('2893212287960')],
      ['fc 89 98 ab c6 6b c0', BigInt('151288809941952')],
      ['fe fa 31 8f a8 e3 ca 11', BigInt('70423237261249041')],
      ['ff ff ff ff ff ff ff ff ff', BigInt('18446744073709551615')],
    ];

    for (const [hex, expected] of vectors) {
      it(`should decode the specification example 0x${hex}`, () => {
        const encoded = bytes(hex);
        expect(codec.varIntLength(encoded[0])).toBe(encoded.byteLength);
        expect(codec.decodeVarInt(encoded)).toBe(expected);
      });
    }

    it('should accept a non-minimal encoding', () => {
      // The specification permits any length that can represent the value, so
      // 0x25 and 0x8025 must both decode to 37.
      expect(codec.decodeVarInt(bytes('80 25')))
          .toBe(codec.decodeVarInt(bytes('25')));
    });

    it('should reject an out-of-range length', () => {
      expect(() => codec.decodeVarInt(new Uint8Array(10))).toThrow();
      expect(() => codec.decodeVarInt(new Uint8Array(0))).toThrow();
    });
  });

  describe('encodeVarInt', () => {
    it('should use one byte for the whole 7-bit range', () => {
      // Draft-16 stopped at 0x3f; draft-18 doubles this to 0x7f.
      expect(encode(BigInt(0))).toEqual(bytes('00'));
      expect(encode(BigInt(37))).toEqual(bytes('25'));
      expect(encode(BigInt(127))).toEqual(bytes('7f'));
    });

    it('should emit the minimal encoding at each length boundary', () => {
      expect(encode(BigInt(128))).toEqual(bytes('80 80'));
      expect(encode(BigInt(16383))).toEqual(bytes('bf ff'));
      expect(encode(BigInt(16384))).toEqual(bytes('c0 40 00'));
      expect(encode(BigInt('72057594037927935')))
          .toEqual(bytes('fe ff ff ff ff ff ff ff'));
      expect(encode(BigInt('72057594037927936')))
          .toEqual(bytes('ff 01 00 00 00 00 00 00 00'));
    });

    it('should reject negative values', () => {
      expect(() => encode(BigInt(-1))).toThrow();
    });

    it('should reject values beyond 64 bits', () => {
      expect(() => encode(BigInt('0x10000000000000000'))).toThrow();
    });
  });

  describe('round trip', () => {
    const values = [
      BigInt(0),
      BigInt(1),
      BigInt(127),
      BigInt(128),
      BigInt(16383),
      BigInt(16384),
      BigInt(2097151),
      BigInt(2097152),
      BigInt(268435455),
      BigInt(268435456),
      BigInt('34359738367'),
      BigInt('34359738368'),
      BigInt('4398046511103'),
      BigInt('4398046511104'),
      BigInt('562949953421311'),
      BigInt('562949953421312'),
      BigInt('72057594037927935'),
      BigInt('72057594037927936'),
      BigInt('18446744073709551615'),
    ];

    for (const value of values) {
      it(`should round trip ${value}`, () => {
        const encoded = encode(value);
        expect(codec.varIntLength(encoded[0])).toBe(encoded.byteLength);
        expect(codec.decodeVarInt(encoded)).toBe(value);
      });
    }
  });

  describe('decodeVarIntAt', () => {
    it('should decode consecutive values and report their sizes', () => {
      // 37 (1 byte), 15293 (2 bytes), 127 (1 byte).
      const buffer = bytes('25 bb bd 7f');

      let offset = 0;
      const first = codec.decodeVarIntAt(buffer, offset);
      expect(first.value).toBe(BigInt(37));
      expect(first.bytesRead).toBe(1);
      offset += first.bytesRead;

      const second = codec.decodeVarIntAt(buffer, offset);
      expect(second.value).toBe(BigInt(15293));
      expect(second.bytesRead).toBe(2);
      offset += second.bytesRead;

      const third = codec.decodeVarIntAt(buffer, offset);
      expect(third.value).toBe(BigInt(127));
      expect(third.bytesRead).toBe(1);
    });
  });

  describe('differences from draft-16', () => {
    it('should encode small values differently than draft-16', () => {
      // 0x40 is two bytes under the QUIC encoding and one byte here, so the
      // two codecs are not interchangeable even for tiny values.
      const draft16 = new shaka.msf.QuicVarIntCodec();
      const writer = new shaka.util.DataViewWriter(
          16, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
      draft16.encodeVarInt(writer, BigInt(0x40));

      expect(writer.getBytes()).toEqual(bytes('40 40'));
      expect(encode(BigInt(0x40))).toEqual(bytes('40'));
    });
  });
});
