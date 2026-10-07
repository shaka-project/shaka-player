/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.Compression', isMSFSupported, () => {
  // '{"version":1,"tracks":[]}', gzipped.
  const GZIPPED_CATALOG = new Uint8Array([
    0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0xff, 0xab, 0x56,
    0x2a, 0x4b, 0x2d, 0x2a, 0xce, 0xcc, 0xcf, 0x53, 0xb2, 0x32, 0xd4, 0x51,
    0x2a, 0x29, 0x4a, 0x4c, 0xce, 0x2e, 0x56, 0xb2, 0x8a, 0x8e, 0xad, 0x05,
    0x00, 0x05, 0xdf, 0x04, 0x44, 0x19, 0x00, 0x00, 0x00,
  ]);
  const CATALOG_TEXT = '{"version":1,"tracks":[]}';

  /** @type {!shaka.extern.MsfCodec} */
  let codec;
  // Assigned here rather than at describe scope, which runs on every
  // platform, including the ones this suite is filtered out of.
  /** @type {?} */
  let Compression;

  beforeEach(() => {
    codec = new shaka.msf.draft18.Codec();
    Compression = shaka.msf.Compression;
  });

  /**
   * @param {!Uint8Array} data
   * @param {?Uint8Array} extensions
   * @param {?Uint8Array=} trackProperties
   * @return {!shaka.extern.MsfObject}
   */
  function moqObject(data, extensions, trackProperties = null) {
    return {
      trackAlias: BigInt(1),
      location: {group: BigInt(0), object: BigInt(0), subgroup: null},
      data,
      extensions,
      trackProperties,
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    };
  }

  /**
   * A properties block carrying MSF_COMPRESSION alone. 0x78 and every value
   * used here fit in one byte in the draft-18 var int encoding.
   *
   * @param {number} algorithm
   * @return {!Uint8Array}
   */
  function compression(algorithm) {
    return new Uint8Array([0x78, algorithm]);
  }

  describe('getAlgorithm', () => {
    it('is none when nothing signals it', () => {
      const obj = moqObject(new Uint8Array([1]), null);
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.NONE);
    });

    it('reads the Object Property', () => {
      const obj = moqObject(new Uint8Array([1]), compression(1));
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.GZIP);
    });

    it('reads the Track Property', () => {
      const obj = moqObject(new Uint8Array([1]), null, compression(1));
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.GZIP);
    });

    it('prefers the Track Property over the Object Property', () => {
      const obj = moqObject(new Uint8Array([1]), compression(0),
          compression(1));
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.GZIP);
    });

    it('finds the property among others by its delta encoded type', () => {
      const obj = moqObject(new Uint8Array([1]), new Uint8Array([
        0x10, 0x05, // LOC Timestamp (0x10) = 5
        0x68, 0x01, // delta 0x68 -> 0x78 = 1
      ]));
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.GZIP);
    });

    it('does not mistake a delta of 0x78 for the property', () => {
      const obj = moqObject(new Uint8Array([1]), new Uint8Array([
        0x08, 0x00, // LOC Timescale (0x08) = 0
        0x78, 0x01, // delta 0x78 -> 0x80, not MSF_COMPRESSION
      ]));
      expect(Compression.getAlgorithm(obj, codec))
          .toBe(Compression.Algorithm.NONE);
    });

    it('reports a value it does not know as it is', () => {
      const obj = moqObject(new Uint8Array([1]), compression(7));
      expect(Compression.getAlgorithm(obj, codec)).toBe(7);
    });
  });

  describe('decode', () => {
    it('returns an uncompressed payload synchronously', () => {
      const data = new Uint8Array([1, 2, 3]);
      expect(Compression.decode(moqObject(data, null), codec)).toBe(data);
      expect(Compression.decode(moqObject(data, compression(0)), codec))
          .toBe(data);
    });

    it('refuses an algorithm it does not know', () => {
      const obj = moqObject(new Uint8Array([1]), compression(2));
      const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.MSF_UNSUPPORTED_COMPRESSION,
          2));
      expect(() => Compression.decode(obj, codec)).toThrow(expected);
    });

    describe('without DecompressionStream', () => {
      /** @type {*} */
      let original;

      beforeEach(() => {
        original = window['DecompressionStream'];
        window['DecompressionStream'] = undefined;
      });

      afterEach(() => {
        window['DecompressionStream'] = original;
      });

      it('refuses GZIP rather than handing it on compressed', () => {
        const obj = moqObject(GZIPPED_CATALOG, compression(1));
        const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MANIFEST,
            shaka.util.Error.Code.MSF_UNSUPPORTED_COMPRESSION,
            1));
        expect(() => Compression.decode(obj, codec)).toThrow(expected);
      });
    });

    filterDescribe('GZIP', isDecompressionStreamSupported, () => {
      it('decompresses an Object Property payload', async () => {
        const obj = moqObject(GZIPPED_CATALOG, compression(1));
        const data = await Compression.decode(obj, codec);
        expect(shaka.util.StringUtils.fromUTF8(data)).toBe(CATALOG_TEXT);
      });

      it('decompresses a Track Property payload', async () => {
        const obj = moqObject(GZIPPED_CATALOG, null, compression(1));
        const data = await Compression.decode(obj, codec);
        expect(shaka.util.StringUtils.fromUTF8(data)).toBe(CATALOG_TEXT);
      });

      it('rejects a payload that is not GZIP', async () => {
        const obj = moqObject(shaka.util.BufferUtils.toUint8(
            shaka.util.StringUtils.toUTF8(CATALOG_TEXT)), compression(1));
        await expectAsync(Promise.resolve(Compression.decode(obj, codec)))
            .toBeRejected();
      });
    });
  });
});
