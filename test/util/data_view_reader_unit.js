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
  const Code = shaka.util.Error.Code;

  // |data| as interpreted as a 64 bit integer must not be larger than 2^53-1.
  // decimal digits.
  const data = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
  // |data2| is small enough in little-endian to be read as a 64-bit number,
  // and has the sign bit set on the first 6 bytes to prove that we don't
  // return negative values.
  const data2 =
      new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0xff, 0xff, 0x01, 0x00]);

  /** @type {!shaka.util.DataViewReader} */
  let bigEndianReader;
  /** @type {!shaka.util.DataViewReader} */
  let littleEndianReader;
  /** @type {!shaka.util.DataViewReader} */
  let bigEndianReader2;
  /** @type {!shaka.util.DataViewReader} */
  let littleEndianReader2;

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
    let value1 = bigEndianReader.readUint8();
    expect(value1).toBe(0x00);

    let value2 = bigEndianReader.readUint8();
    expect(value2).toBe(0x01);

    let value3 = bigEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    let value4 = bigEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in big endian', function() {
    let value1 = bigEndianReader.readUint16();
    expect(value1).toBe(0x0001);

    let value2 = bigEndianReader.readUint16();
    expect(value2).toBe(0x0203);

    let value3 = bigEndianReader2.readUint16();
    expect(value3).toBe(0xdead);

    let value4 = bigEndianReader2.readUint16();
    expect(value4).toBe(0xbeef);
  });

  it('reads a uint32 in big endian', function() {
    let value1 = bigEndianReader.readUint32();
    expect(value1).toBe(0x00010203);

    let value2 = bigEndianReader.readUint32();
    expect(value2).toBe(0x04050607);

    let value3 = bigEndianReader2.readUint32();
    expect(value3).toBe(0xdeadbeef);

    let value4 = bigEndianReader2.readUint32();
    expect(value4).toBe(0xffff0100);
  });

  it('reads an int32 in big endian', function() {
    let value1 = bigEndianReader.readInt32();
    expect(value1).toBe(66051);

    let value2 = bigEndianReader.readInt32();
    expect(value2).toBe(67438087);

    let value3 = bigEndianReader2.readInt32();
    expect(value3).toBe(-559038737);

    let value4 = bigEndianReader2.readInt32();
    expect(value4).toBe(-65280);
  });

  it('reads a uint64 in big endian', function() {
    let value = bigEndianReader.readUint64();
    expect(value).toBe(0x0001020304050607);
  });

  it('reads a uint8 in little endian', function() {
    let value1 = littleEndianReader.readUint8();
    expect(value1).toBe(0x00);

    let value2 = littleEndianReader.readUint8();
    expect(value2).toBe(0x01);

    let value3 = littleEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    let value4 = littleEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in little endian', function() {
    let value1 = littleEndianReader.readUint16();
    expect(value1).toBe(0x0100);

    let value2 = littleEndianReader.readUint16();
    expect(value2).toBe(0x0302);

    let value3 = littleEndianReader2.readUint16();
    expect(value3).toBe(0xadde);

    let value4 = littleEndianReader2.readUint16();
    expect(value4).toBe(0xefbe);
  });

  it('reads a uint32 in little endian', function() {
    let value1 = littleEndianReader.readUint32();
    expect(value1).toBe(0x03020100);

    let value2 = littleEndianReader.readUint32();
    expect(value2).toBe(0x07060504);

    let value3 = littleEndianReader2.readUint32();
    expect(value3).toBe(0xefbeadde);

    let value4 = littleEndianReader2.readUint32();
    expect(value4).toBe(0x0001ffff);
  });

  it('reads an int32 in little endian', function() {
    let value1 = littleEndianReader.readInt32();
    expect(value1).toBe(50462976);

    let value2 = littleEndianReader.readInt32();
    expect(value2).toBe(117835012);

    let value3 = littleEndianReader2.readInt32();
    expect(value3).toBe(-272716322);

    let value4 = littleEndianReader2.readInt32();
    expect(value4).toBe(131071);
  });

  it('reads a uint64 in little endian', function() {
    let value = littleEndianReader2.readUint64();
    expect(value).toBe(0x0001ffffefbeadde);
  });

  it('skips bytes', function() {
    bigEndianReader.skip(1);
    let value = bigEndianReader.readUint8();
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

  describe('end-of-stream', function() {
    it('detects when reading a uint8', function() {
      bigEndianReader.skip(7);
      bigEndianReader.readUint8();
      runTest(function() { bigEndianReader.readUint8(); });
    });

    it('detects when reading a uint16', function() {
      bigEndianReader.skip(7);
      runTest(function() { bigEndianReader.readUint16(); });
    });

    it('detects when reading a uint32', function() {
      bigEndianReader.skip(5);
      runTest(function() { bigEndianReader.readUint32(); });
    });

    it('detects when reading a int32', function() {
      bigEndianReader.skip(5);
      runTest(function() { bigEndianReader.readInt32(); });
    });

    it('detects when reading a uint64', function() {
      bigEndianReader.skip(3);
      runTest(function() { bigEndianReader.readUint64(); });
    });

    it('detects when skipping bytes', function() {
      bigEndianReader.skip(8);
      runTest(function() { bigEndianReader.skip(1); });
    });

    it('detects when reading bytes', function() {
      bigEndianReader.skip(8);
      runTest(function() { bigEndianReader.readBytes(1); });
    });

    function runTest(test) {
      try {
        test();
        fail('Should throw exception');
      } catch (e) {
        expect(e).not.toBeNull();
        expect(e instanceof shaka.util.Error).toBe(true);
        expect(e.code).toBe(Code.BUFFER_READ_OUT_OF_BOUNDS);
      }
    }
  });

  it('detects uint64s too large for JavaScript', function() {
    let exception = null;

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
