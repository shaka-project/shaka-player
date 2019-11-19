/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('EbmlParser', /** @suppress {accessControls} */ () => {
  const Util = shaka.test.Util;

  it('parses one element', () => {
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    const data = new Uint8Array([0x81, 0x84, 0x01, 0x02, 0x03, 0x04]);
    const parser = new shaka.util.EbmlParser(data);

    const elem = parser.parseElement();
    expect(elem.id).toBe(0x81);
    expect(elem.dataView_.byteLength).toBe(4);
    expect(elem.dataView_.getUint8(0)).toBe(0x01);
    expect(elem.dataView_.getUint8(1)).toBe(0x02);
    expect(elem.dataView_.getUint8(2)).toBe(0x03);
    expect(elem.dataView_.getUint8(3)).toBe(0x04);
  });

  it('parses two elements at the same level', () => {
    // For the first element:
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    // For the second element:
    // Set ID to 0x2.
    // Set size to 4 bytes.
    // Set the data to [0x09, 0x08, 0x07, 0x06].
    const data = new Uint8Array([
      0x81, 0x84, 0x01, 0x02, 0x03, 0x04, 0x82, 0x84, 0x09, 0x08, 0x07, 0x06,
    ]);
    const parser = new shaka.util.EbmlParser(data);

    const elem1 = parser.parseElement();
    expect(elem1.id).toBe(0x81);
    expect(elem1.dataView_.byteLength).toBe(4);
    expect(elem1.dataView_.getUint8(0)).toBe(0x01);
    expect(elem1.dataView_.getUint8(1)).toBe(0x02);
    expect(elem1.dataView_.getUint8(2)).toBe(0x03);
    expect(elem1.dataView_.getUint8(3)).toBe(0x04);

    const elem2 = parser.parseElement();
    expect(elem2.id).toBe(0x82);
    expect(elem2.dataView_.byteLength).toBe(4);
    expect(elem2.dataView_.getUint8(0)).toBe(0x09);
    expect(elem2.dataView_.getUint8(1)).toBe(0x08);
    expect(elem2.dataView_.getUint8(2)).toBe(0x07);
    expect(elem2.dataView_.getUint8(3)).toBe(0x06);
  });

  it('detects a dynamic size value within an element', () => {
    // Set ID to 0x1.
    // Set size to a dynamic size value.
    // The size should be 5 bytes.
    // Set the data to [0xaa, 0xbb, 0xcc, 0xdd, 0xee].
    const data = new Uint8Array([0x81, 0xff, 0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
    const parser = new shaka.util.EbmlParser(data);
    const element = parser.parseElement();

    expect(element).toBeTruthy();
    expect(element.dataView_.byteLength).toBe(5);
  });

  it('parses a 1 byte vint', () => {
    // 7-bit value: 1|100 0001
    const data = new Uint8Array([0xc1]);

    // Extract the variable sized integer from |data|. Note that since
    // |data| contains exactly one variable sized integer, |vint| should be
    // identical to |data|.
    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x41);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x41);
  });

  it('parses a 2 byte vint', () => {
    // 14-bit: 01|10 0001, 0001 1001
    const data = new Uint8Array([0x61, 0x19]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x2119);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x2119);
  });

  it('parses a 3 byte vint', () => {
    // 21-bit: 001|1 0001, 0010 0001, 0001 0011
    const data = new Uint8Array([0x31, 0x21, 0x13]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x112113);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x112113);
  });

  it('parses a 4 byte vint', () => {
    // 28-bit: 0001 | 1000, 0001 0001, 0001 0001, 0001 0101
    const data = new Uint8Array([0x18, 0x11, 0x11, 0x15]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x8111115);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x8111115);
  });

  it('parses a 5 byte vint', () => {
    // 35-bit: 0000 1|100, 0001 0001, 0001 0001, 0001 0001, 0001 1001
    const data = new Uint8Array([0x0c, 0x11, 0x11, 0x11, 0x19]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x411111119);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x411111119);
  });

  it('parses a 6 byte vint', () => {
    // 42-bit: 0000 01|10, 0001 0010, 0001 0001, 0001 0001, 0001 0001,
    //                     0001 1000
    const data = new Uint8Array([0x06, 0x12, 0x11, 0x11, 0x11, 0x18]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x21211111118);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x21211111118);
  });

  it('parses a 7 byte vint', () => {
    // 49-bit: 0000 001|1, 0001 0010, 0001 0001, 0001 0001, 0001 0001,
    //                     0001 0001, 1001 0001
    const data = new Uint8Array([0x03, 0x12, 0x11, 0x11, 0x11, 0x11, 0x91]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x1121111111191);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x1121111111191);
  });

  it('parses a 8 byte vint', () => {
    // 56-bit: 0000 0001 | 0001 0010, 0001 0100, 0001 1000, 0001 0001,
    //                     0001 0001, 0001 1001, 0011 0001
    const data =
        new Uint8Array([0x01, 0x12, 0x14, 0x18, 0x11, 0x11, 0x19, 0x31]);

    const parser = new shaka.util.EbmlParser(data);
    const vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x12141811111931);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x12141811111931);
  });

  it('detects vints with too many bytes', () => {
    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_OVERFLOW));

    expect(() => {
      // 63-bit: 0000 0000, 1|000 0001, 0001 0001, 0001 0001, 0001 0001,
      //                                0001 0001, 0001 0001, 0001 0001,
      //                                0001 0001
      const data = new Uint8Array(
          [0x00, 0x81, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      const parser = new shaka.util.EbmlParser(data);
      parser.parseVint_();
    }).toThrow(expected);
  });

  it('detects vint values with too many bits', () => {
    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW));

    expect(() => {
      // 56-bit: 0000 0001 | 1000 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      const data = new Uint8Array(
          [0x01, 0x81, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    }).toThrow(expected);

    expect(() => {
      // 56-bit: 0000 0001 | 0100 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      const data = new Uint8Array(
          [0x01, 0x41, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    }).toThrow(expected);

    expect(() => {
      // 56-bit: 0000 0001 | 0010 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      const data = new Uint8Array(
          [0x01, 0x21, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    }).toThrow(expected);
  });

  it('detects the end of input while reading a vint', () => {
    // 14-bit: 01|10 0001, 0001 0001
    const data = new Uint8Array([0x61]);
    const parser = new shaka.util.EbmlParser(data);

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS));
    expect(() => parser.parseVint_()).toThrow(expected);
  });

  it('parses a uint', () => {
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    const data = new Uint8Array([0x81, 0x84, 0x01, 0x02, 0x03, 0x04]);
    const parser = new shaka.util.EbmlParser(data);

    const elem = parser.parseElement();
    expect(elem.id).toBe(0x81);
    expect(elem.getUint()).toBe(0x01020304);
  });

  it('detects uints with too many bytes', () => {
    // Set ID to 0x1.
    // Set size to 9 bytes.
    // Set the data to [0x01, 0x02, 0x03, ..., 0x09].
    const data = new Uint8Array(
        [0x81, 0x89, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
    const parser = new shaka.util.EbmlParser(data);

    const elem = parser.parseElement();
    expect(elem.id).toBe(0x81);

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_OVERFLOW));
    expect(() => elem.getUint()).toThrow(expected);
  });

  it('detects uints with too many bits', () => {
    // Set ID to 0x1.
    // Set size to 8 bytes.
    // Set the data to [0x2f, 0xff, 0xff, ..., 0xff].
    const data = new Uint8Array(
        [0x81, 0x88, 0x2f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    const parser = new shaka.util.EbmlParser(data);

    const elem = parser.parseElement();
    expect(elem.id).toBe(0x81);

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW));
    expect(() => elem.getUint()).toThrow(expected);
  });

  it('recognizes dynamic-sized values', () => {
    const dynamicSizes = [
      new Uint8Array([0xff]),
      new Uint8Array([0x7f, 0xff]),
      new Uint8Array([0x3f, 0xff, 0xff]),
      new Uint8Array([0x1f, 0xff, 0xff, 0xff]),
      new Uint8Array([0x0f, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x07, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    ];

    const EbmlParser = shaka.util.EbmlParser;

    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[0])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[1])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[2])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[3])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[4])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[5])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[6])).toBe(true);
    expect(EbmlParser.isDynamicSizeValue_(dynamicSizes[7])).toBe(true);
  });
});

