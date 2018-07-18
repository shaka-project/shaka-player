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

describe('EbmlParser', /** @suppress {accessControls} */ function() {
  const Code = shaka.util.Error.Code;

  it('parses one element', function() {
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    let data = new Uint8Array([0x81, 0x84, 0x01, 0x02, 0x03, 0x04]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let elem = parser.parseElement();
    expect(elem.id).toBe(0x81);
    expect(elem.dataView_.byteLength).toBe(4);
    expect(elem.dataView_.getUint8(0)).toBe(0x01);
    expect(elem.dataView_.getUint8(1)).toBe(0x02);
    expect(elem.dataView_.getUint8(2)).toBe(0x03);
    expect(elem.dataView_.getUint8(3)).toBe(0x04);
  });

  it('parses two elements at the same level', function() {
    // For the first element:
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    // For the second element:
    // Set ID to 0x2.
    // Set size to 4 bytes.
    // Set the data to [0x09, 0x08, 0x07, 0x06].
    let data = new Uint8Array([0x81, 0x84, 0x01, 0x02, 0x03, 0x04, 0x82, 0x84,
                               0x09, 0x08, 0x07, 0x06]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let elem1 = parser.parseElement();
    expect(elem1.id).toBe(0x81);
    expect(elem1.dataView_.byteLength).toBe(4);
    expect(elem1.dataView_.getUint8(0)).toBe(0x01);
    expect(elem1.dataView_.getUint8(1)).toBe(0x02);
    expect(elem1.dataView_.getUint8(2)).toBe(0x03);
    expect(elem1.dataView_.getUint8(3)).toBe(0x04);

    let elem2 = parser.parseElement();
    expect(elem2.id).toBe(0x82);
    expect(elem2.dataView_.byteLength).toBe(4);
    expect(elem2.dataView_.getUint8(0)).toBe(0x09);
    expect(elem2.dataView_.getUint8(1)).toBe(0x08);
    expect(elem2.dataView_.getUint8(2)).toBe(0x07);
    expect(elem2.dataView_.getUint8(3)).toBe(0x06);
  });

  it('detects a dynamic size value within an element', function() {
    // Set ID to 0x1.
    // Set size to a dynamic size value.
    // The size should be 5 bytes.
    // Set the data to [0xaa, 0xbb, 0xcc, 0xdd, 0xee].
    let data = new Uint8Array([0x81, 0xff, 0xaa, 0xbb, 0xcc, 0xdd, 0xee]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let element = parser.parseElement();

    expect(element).toBeTruthy();
    expect(element.dataView_.byteLength).toBe(5);
  });

  it('parses a 1 byte vint', function() {
    // 7-bit value: 1|100 0001
    let data = new Uint8Array([0xc1]);

    // Extract the variable sized integer from |data|. Note that since
    // |data| contains exactly one variable sized integer, |vint| should be
    // identical to |data|.
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x41);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x41);
  });

  it('parses a 2 byte vint', function() {
    // 14-bit: 01|10 0001, 0001 1001
    let data = new Uint8Array([0x61, 0x19]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x2119);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x2119);
  });

  it('parses a 3 byte vint', function() {
    // 21-bit: 001|1 0001, 0010 0001, 0001 0011
    let data = new Uint8Array([0x31, 0x21, 0x13]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x112113);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x112113);
  });

  it('parses a 4 byte vint', function() {
    // 28-bit: 0001 | 1000, 0001 0001, 0001 0001, 0001 0101
    let data = new Uint8Array([0x18, 0x11, 0x11, 0x15]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x8111115);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x8111115);
  });

  it('parses a 5 byte vint', function() {
    // 35-bit: 0000 1|100, 0001 0001, 0001 0001, 0001 0001, 0001 1001
    let data = new Uint8Array([0x0c, 0x11, 0x11, 0x11, 0x19]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x411111119);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x411111119);
  });

  it('parses a 6 byte vint', function() {
    // 42-bit: 0000 01|10, 0001 0010, 0001 0001, 0001 0001, 0001 0001,
    //                     0001 1000
    let data = new Uint8Array([0x06, 0x12, 0x11, 0x11, 0x11, 0x18]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x21211111118);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x21211111118);
  });

  it('parses a 7 byte vint', function() {
    // 49-bit: 0000 001|1, 0001 0010, 0001 0001, 0001 0001, 0001 0001,
    //                     0001 0001, 1001 0001
    let data = new Uint8Array([0x03, 0x12, 0x11, 0x11, 0x11, 0x11, 0x91]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x1121111111191);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x1121111111191);
  });

  it('parses a 8 byte vint', function() {
    // 56-bit: 0000 0001 | 0001 0010, 0001 0100, 0001 1000, 0001 0001,
    //                     0001 0001, 0001 1001, 0011 0001
    let data = new Uint8Array([0x01, 0x12, 0x14, 0x18, 0x11, 0x11, 0x19, 0x31]);

    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
    let vint = parser.parseVint_();

    expect(shaka.util.EbmlParser.getVintValue_(data)).toBe(0x12141811111931);
    expect(shaka.util.EbmlParser.getVintValue_(vint)).toBe(0x12141811111931);
  });

  it('detects vints with too many bytes', function() {
    let exception = null;

    try {
      // 63-bit: 0000 0000, 1|000 0001, 0001 0001, 0001 0001, 0001 0001,
      //                                0001 0001, 0001 0001, 0001 0001,
      //                                0001 0001
      let data = new Uint8Array(
          [0x00, 0x81, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      let parser = new shaka.util.EbmlParser(new DataView(data.buffer));
      parser.parseVint_();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.EBML_OVERFLOW);
  });

  it('detects vint values with too many bits', function() {
    let exception = null;

    try {
      // 56-bit: 0000 0001 | 1000 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      let data = new Uint8Array(
          [0x01, 0x81, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);

    exception = null;

    try {
      // 56-bit: 0000 0001 | 0100 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      let data = new Uint8Array(
          [0x01, 0x41, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);

    exception = null;

    try {
      // 56-bit: 0000 0001 | 0010 0001, 0001 0001, 0001 0001, 0001 0001,
      //                     0001 0001, 0001 0001, 0001 0001
      let data = new Uint8Array(
          [0x01, 0x21, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11]);
      shaka.util.EbmlParser.getVintValue_(data);
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);
  });

  it('detects the end of input while reading a vint', function() {
    // 14-bit: 01|10 0001, 0001 0001
    let data = new Uint8Array([0x61]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let exception = null;

    try {
      parser.parseVint_();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
  });

  it('parses a uint', function() {
    // Set ID to 0x1.
    // Set size to 4 bytes.
    // Set the data to [0x01, 0x02, 0x03, 0x04].
    let data = new Uint8Array([0x81, 0x84, 0x01, 0x02, 0x03, 0x04]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let elem = parser.parseElement();
    expect(elem.id).toBe(0x81);
    expect(elem.getUint()).toBe(0x01020304);
  });

  it('detects uints with too many bytes', function() {
    // Set ID to 0x1.
    // Set size to 9 bytes.
    // Set the data to [0x01, 0x02, 0x03, ..., 0x09].
    let data = new Uint8Array(
        [0x81, 0x89, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let elem = parser.parseElement();
    expect(elem.id).toBe(0x81);

    let exception = null;

    try {
      elem.getUint();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.EBML_OVERFLOW);
  });

  it('detects uints with too many bits', function() {
    // Set ID to 0x1.
    // Set size to 8 bytes.
    // Set the data to [0x2f, 0xff, 0xff, ..., 0xff].
    let data = new Uint8Array(
        [0x81, 0x88, 0x2f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    let parser = new shaka.util.EbmlParser(new DataView(data.buffer));

    let elem = parser.parseElement();
    expect(elem.id).toBe(0x81);

    let exception = null;

    try {
      elem.getUint();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);
  });

  it('recognizes dynamic-sized values', function() {
    let dynamicSizes = [
      new Uint8Array([0xff]),
      new Uint8Array([0x7f, 0xff]),
      new Uint8Array([0x3f, 0xff, 0xff]),
      new Uint8Array([0x1f, 0xff, 0xff, 0xff]),
      new Uint8Array([0x0f, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x07, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    ];

    let isDynamicSizeValue_ = shaka.util.EbmlParser.isDynamicSizeValue_;

    expect(isDynamicSizeValue_(dynamicSizes[0])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[1])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[2])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[3])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[4])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[5])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[6])).toBe(true);
    expect(isDynamicSizeValue_(dynamicSizes[7])).toBe(true);
  });
});

