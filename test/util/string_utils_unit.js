/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('StringUtils', function() {
  const StringUtils = shaka.util.StringUtils;

  it('parses fromUTF8', function() {
    // This is 4 Unicode characters, the last will be split into a surrogate
    // pair.
    let arr = [0x46, 0xe2, 0x82, 0xac, 0x20, 0xf0, 0x90, 0x8d, 0x88];
    let buffer = new Uint8Array(arr).buffer;
    expect(StringUtils.fromUTF8(buffer)).toBe('F\u20ac \ud800\udf48');
  });

  it('strips the BOM in fromUTF8', function() {
    // This is 4 Unicode characters, the last will be split into a surrogate
    // pair.
    let arr = [0xef, 0xbb, 0xbf, 0x74, 0x65, 0x78, 0x74];
    let buffer = new Uint8Array(arr).buffer;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    expect(StringUtils.fromUTF8(buffer)).toBe(ContentType.TEXT);
  });

  it('parses fromUTF16 big-endian', function() {
    // This is big-endian pairs of 16-bit numbers.  This translates into 3
    // Unicode characters where the last is split into a surrogate pair.
    let arr = [0x00, 0x46, 0x38, 0x01, 0xd8, 0x01, 0xdc, 0x37];
    let buffer = new Uint8Array(arr).buffer;
    expect(StringUtils.fromUTF16(buffer, false)).toBe('F\u3801\ud801\udc37');
  });

  it('parses fromUTF16 little-endian', function() {
    // This is little-endian pairs of 16-bit numbers.  This translates into 3
    // Unicode characters where the last is split into a surrogate pair.
    let arr = [0x46, 0x00, 0x01, 0x38, 0x01, 0xd8, 0x37, 0xdc];
    let buffer = new Uint8Array(arr).buffer;
    expect(StringUtils.fromUTF16(buffer, true)).toBe('F\u3801\ud801\udc37');
  });

  describe('fromBytesAutoDetect', function() {
    it('detects UTF-8 BOM', function() {
      let arr = [0xef, 0xbb, 0xbf, 0x46, 0x6f, 0x6f];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('detects UTF-16 BE BOM', function() {
      let arr = [0xfe, 0xff, 0x00, 0x46, 0x00, 0x6f, 0x00, 0x6f];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('detects UTF-16 LE BOM', function() {
      let arr = [0xff, 0xfe, 0x46, 0x00, 0x6f, 0x00, 0x6f, 0x00];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('guesses UTF-8', function() {
      let arr = [0x46, 0x6f, 0x6f];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('guesses UTF-16 BE', function() {
      let arr = [0x00, 0x46, 0x00, 0x6f, 0x00, 0x6f];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('guesses UTF-16 LE', function() {
      let arr = [0x46, 0x00, 0x6f, 0x00, 0x6f, 0x00];
      let buffer = new Uint8Array(arr).buffer;
      expect(StringUtils.fromBytesAutoDetect(buffer)).toBe('Foo');
    });

    it('fails if unable to guess', function() {
      try {
        let arr = [0x01, 0x02, 0x03, 0x04];
        let buffer = new Uint8Array(arr).buffer;
        StringUtils.fromBytesAutoDetect(buffer);
        fail('Should not be able to guess');
      } catch (e) {
        expect(e.category).toBe(shaka.util.Error.Category.TEXT);
        expect(e.code).toBe(shaka.util.Error.Code.UNABLE_TO_DETECT_ENCODING);
      }
    });
  });

  it('converts toUTF8', function() {
    let str = 'Xe\u4524\u1952';
    let arr = [0x58, 0x65, 0xe4, 0x94, 0xa4, 0xe1, 0xa5, 0x92];
    let buffer = StringUtils.toUTF8(str);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array(arr));
  });

  it('converts toUTF16-LE', function() {
    const str = 'Xe\u4524\u1952';
    const arr = [0x58, 0, 0x65, 0, 0x24, 0x45, 0x52, 0x19];
    const buffer = StringUtils.toUTF16(str, /* littleEndian */ true);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array(arr));
  });

  it('converts toUTF16-BE', function() {
    const str = 'Xe\u4524\u1952';
    const arr = [0, 0x58, 0, 0x65, 0x45, 0x24, 0x19, 0x52];
    const buffer = StringUtils.toUTF16(str, /* littleEndian */ false);
    expect(new Uint8Array(buffer)).toEqual(new Uint8Array(arr));
  });

  it('does not cause stack overflow, #335', function() {
    let buffer = new Uint8Array(8e5).buffer;  // Well above arg count limit.
    expect(StringUtils.fromUTF8(buffer).length).toBe(buffer.byteLength);
    expect(StringUtils.fromUTF16(buffer, true).length)
        .toBe(buffer.byteLength / 2);
  });
});
