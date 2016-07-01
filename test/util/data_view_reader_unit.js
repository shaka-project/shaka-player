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

describe('DataViewReader', function() {
  // |data| as interpreted as a 64 bit integer must not be larger than 2^53-1.
  // decimal digits.
  var data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  // |data2| is small enough in little-endian to be read as a 64-bit number,
  // and has the sign bit set on the first 6 bytes to prove that we don't
  // return negative values.
  var data2 = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xff, 0xff, 0x01, 0x00]);

  var bigEndianReader;
  var littleEndianReader;
  var bigEndianReader2;
  var littleEndianReader2;

  var Code;

  beforeAll(function() {
    Code = shaka.util.Error.Code;
  });

  beforeEach(function() {
    bigEndianReader = new shaka.util.DataViewReader(
        new DataView(data.buffer),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    bigEndianReader2 = new shaka.util.DataViewReader(
        new DataView(data2.buffer),
        shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    littleEndianReader = new shaka.util.DataViewReader(
        new DataView(data.buffer),
        shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN);
    littleEndianReader2 = new shaka.util.DataViewReader(
        new DataView(data2.buffer),
        shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN);
  });

  it('reads a uint8 in big endian', function() {
    var value1 = bigEndianReader.readUint8();
    expect(value1).toBe(0x00);

    var value2 = bigEndianReader.readUint8();
    expect(value2).toBe(0x01);

    var value3 = bigEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    var value4 = bigEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in big endian', function() {
    var value1 = bigEndianReader.readUint16();
    expect(value1).toBe(0x0001);

    var value2 = bigEndianReader.readUint16();
    expect(value2).toBe(0x0203);

    var value3 = bigEndianReader2.readUint16();
    expect(value3).toBe(0xdead);

    var value4 = bigEndianReader2.readUint16();
    expect(value4).toBe(0xbeef);
  });

  it('reads a uint32 in big endian', function() {
    var value1 = bigEndianReader.readUint32();
    expect(value1).toBe(0x00010203);

    var value2 = bigEndianReader.readUint32();
    expect(value2).toBe(0x04050607);

    var value3 = bigEndianReader2.readUint32();
    expect(value3).toBe(0xdeadbeef);

    var value4 = bigEndianReader2.readUint32();
    expect(value4).toBe(0xffff0100);
  });

  it('reads a uint64 in big endian', function() {
    var value = bigEndianReader.readUint64();
    expect(value).toBe(0x0001020304050607);
  });

  it('reads a uint8 in little endian', function() {
    var value1 = littleEndianReader.readUint8();
    expect(value1).toBe(0x00);

    var value2 = littleEndianReader.readUint8();
    expect(value2).toBe(0x01);

    var value3 = littleEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    var value4 = littleEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in little endian', function() {
    var value1 = littleEndianReader.readUint16();
    expect(value1).toBe(0x0100);

    var value2 = littleEndianReader.readUint16();
    expect(value2).toBe(0x0302);

    var value3 = littleEndianReader2.readUint16();
    expect(value3).toBe(0xadde);

    var value4 = littleEndianReader2.readUint16();
    expect(value4).toBe(0xefbe);
  });

  it('reads a uint32 in little endian', function() {
    var value1 = littleEndianReader.readUint32();
    expect(value1).toBe(0x03020100);

    var value2 = littleEndianReader.readUint32();
    expect(value2).toBe(0x07060504);

    var value3 = littleEndianReader2.readUint32();
    expect(value3).toBe(0xefbeadde);

    var value4 = littleEndianReader2.readUint32();
    expect(value4).toBe(0x0001ffff);
  });

  it('reads a uint64 in little endian', function() {
    var value = littleEndianReader2.readUint64();
    expect(value).toBe(0x0001ffffefbeadde);
  });

  it('skips bytes', function() {
    bigEndianReader.skip(1);
    var value = bigEndianReader.readUint8();
    expect(value).toBe(0x01);
  });

  it('determines the end of the data view', function() {
    bigEndianReader.skip(7);
    expect(bigEndianReader.hasMoreData()).toBe(true);

    bigEndianReader.skip(1);
    expect(bigEndianReader.hasMoreData()).toBe(false);
  });

  it('gets the byte position', function() {
    expect(bigEndianReader.getPosition()).toBe(0);

    bigEndianReader.skip(1);
    expect(bigEndianReader.getPosition()).toBe(1);

    bigEndianReader.skip(7);
    expect(bigEndianReader.getPosition()).toBe(8);
  });

  it('detects end-of-stream when reading a uint8', function() {
    bigEndianReader.skip(7);
    bigEndianReader.readUint8();

    var exception = null;

    try {
      bigEndianReader.readUint8();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
  });

  it('detects end-of-stream when reading a uint16', function() {
    bigEndianReader.skip(7);

    var exception = null;

    try {
      bigEndianReader.readUint16();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
  });

  it('detects end-of-stream when reading a uint32', function() {
    bigEndianReader.skip(5);

    var exception = null;

    try {
      bigEndianReader.readUint32();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
  });

  it('detects end-of-stream when skipping bytes', function() {
    bigEndianReader.skip(8);

    var exception = null;

    try {
      bigEndianReader.skip(1);
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBeNull();
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
  });

  it('detects uint64s too large for JavaScript', function() {
    var exception = null;

    try {
      littleEndianReader.readUint64();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBe(null);
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);

    exception = null;

    try {
      bigEndianReader2.readUint64();
    } catch (e) {
      exception = e;
    }

    expect(exception).not.toBe(null);
    expect(exception instanceof shaka.util.Error).toBe(true);
    expect(exception.code).toBe(Code.JS_INTEGER_OVERFLOW);
  });
});
