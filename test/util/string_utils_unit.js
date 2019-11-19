/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('StringUtils', () => {
  const StringUtils = shaka.util.StringUtils;

  it('parses fromUTF8', () => {
    // This is 4 Unicode characters, the last will be split into a surrogate
    // pair.
    const arr = [0x46, 0xe2, 0x82, 0xac, 0x20, 0xf0, 0x90, 0x8d, 0x88];
    expect(StringUtils.fromUTF8(new Uint8Array(arr)))
        .toBe('F\u20ac \ud800\udf48');
  });

  it('strips the BOM in fromUTF8', () => {
    // This is 4 Unicode characters, the last will be split into a surrogate
    // pair.
    const arr = [0xef, 0xbb, 0xbf, 0x74, 0x65, 0x78, 0x74];
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    expect(StringUtils.fromUTF8(new Uint8Array(arr))).toBe(ContentType.TEXT);
  });

  it('parses fromUTF16 big-endian', () => {
    // This is big-endian pairs of 16-bit numbers.  This translates into 3
    // Unicode characters where the last is split into a surrogate pair.
    const arr = [0x00, 0x46, 0x38, 0x01, 0xd8, 0x01, 0xdc, 0x37];
    expect(StringUtils.fromUTF16(new Uint8Array(arr), false))
        .toBe('F\u3801\ud801\udc37');
  });

  it('parses fromUTF16 little-endian', () => {
    // This is little-endian pairs of 16-bit numbers.  This translates into 3
    // Unicode characters where the last is split into a surrogate pair.
    const arr = [0x46, 0x00, 0x01, 0x38, 0x01, 0xd8, 0x37, 0xdc];
    expect(StringUtils.fromUTF16(new Uint8Array(arr), true))
        .toBe('F\u3801\ud801\udc37');
  });

  describe('fromBytesAutoDetect', () => {
    it('detects UTF-8 BOM', () => {
      const arr = [0xef, 0xbb, 0xbf, 0x46, 0x6f, 0x6f];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('detects UTF-16 BE BOM', () => {
      const arr = [0xfe, 0xff, 0x00, 0x46, 0x00, 0x6f, 0x00, 0x6f];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('detects UTF-16 LE BOM', () => {
      const arr = [0xff, 0xfe, 0x46, 0x00, 0x6f, 0x00, 0x6f, 0x00];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('guesses UTF-8', () => {
      const arr = [0x46, 0x6f, 0x6f];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('guesses UTF-16 BE', () => {
      const arr = [0x00, 0x46, 0x00, 0x6f, 0x00, 0x6f];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('guesses UTF-16 LE', () => {
      const arr = [0x46, 0x00, 0x6f, 0x00, 0x6f, 0x00];
      expect(StringUtils.fromBytesAutoDetect(new Uint8Array(arr))).toBe('Foo');
    });

    it('fails if unable to guess', () => {
      const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.UNABLE_TO_DETECT_ENCODING));
      const arr = [0x01, 0x02, 0x03, 0x04];
      expect(() => StringUtils.fromBytesAutoDetect(new Uint8Array(arr)))
          .toThrow(expected);
    });
  });

  it('converts toUTF8', () => {
    const str = 'Xe\u4524\u1952';
    const arr = [0x58, 0x65, 0xe4, 0x94, 0xa4, 0xe1, 0xa5, 0x92];
    const buffer = StringUtils.toUTF8(str);
    expect(shaka.util.BufferUtils.toUint8(buffer))
        .toEqual(new Uint8Array(arr));
  });

  it('converts toUTF16-LE', () => {
    const str = 'Xe\u4524\u1952';
    const arr = [0x58, 0, 0x65, 0, 0x24, 0x45, 0x52, 0x19];
    const buffer = StringUtils.toUTF16(str, /* littleEndian */ true);
    expect(shaka.util.BufferUtils.toUint8(buffer))
        .toEqual(new Uint8Array(arr));
  });

  it('converts toUTF16-BE', () => {
    const str = 'Xe\u4524\u1952';
    const arr = [0, 0x58, 0, 0x65, 0x45, 0x24, 0x19, 0x52];
    const buffer = StringUtils.toUTF16(str, /* littleEndian */ false);
    expect(shaka.util.BufferUtils.toUint8(buffer))
        .toEqual(new Uint8Array(arr));
  });

  it('does not cause stack overflow, #335', () => {
    const buffer = new Uint8Array(8e5);  // Well above arg count limit.
    expect(StringUtils.fromUTF8(buffer).length).toBe(buffer.byteLength);
    expect(StringUtils.fromUTF16(buffer, true).length)
        .toBe(buffer.byteLength / 2);
  });
});
