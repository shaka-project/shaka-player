/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DataViewReader', () => {
  const Util = shaka.test.Util;

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

  beforeEach(() => {
    bigEndianReader = new shaka.util.DataViewReader(
        data, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    bigEndianReader2 = new shaka.util.DataViewReader(
        data2, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    littleEndianReader = new shaka.util.DataViewReader(
        data, shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN);
    littleEndianReader2 = new shaka.util.DataViewReader(
        data2, shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN);
  });

  it('reads a uint8 in big endian', () => {
    const value1 = bigEndianReader.readUint8();
    expect(value1).toBe(0x00);

    const value2 = bigEndianReader.readUint8();
    expect(value2).toBe(0x01);

    const value3 = bigEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    const value4 = bigEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in big endian', () => {
    const value1 = bigEndianReader.readUint16();
    expect(value1).toBe(0x0001);

    const value2 = bigEndianReader.readUint16();
    expect(value2).toBe(0x0203);

    const value3 = bigEndianReader2.readUint16();
    expect(value3).toBe(0xdead);

    const value4 = bigEndianReader2.readUint16();
    expect(value4).toBe(0xbeef);
  });

  it('reads a uint32 in big endian', () => {
    const value1 = bigEndianReader.readUint32();
    expect(value1).toBe(0x00010203);

    const value2 = bigEndianReader.readUint32();
    expect(value2).toBe(0x04050607);

    const value3 = bigEndianReader2.readUint32();
    expect(value3).toBe(0xdeadbeef);

    const value4 = bigEndianReader2.readUint32();
    expect(value4).toBe(0xffff0100);
  });

  it('reads an int32 in big endian', () => {
    const value1 = bigEndianReader.readInt32();
    expect(value1).toBe(66051);

    const value2 = bigEndianReader.readInt32();
    expect(value2).toBe(67438087);

    const value3 = bigEndianReader2.readInt32();
    expect(value3).toBe(-559038737);

    const value4 = bigEndianReader2.readInt32();
    expect(value4).toBe(-65280);
  });

  it('reads a uint64 in big endian', () => {
    const value = bigEndianReader.readUint64();
    expect(value).toBe(0x0001020304050607);
  });

  it('reads a uint8 in little endian', () => {
    const value1 = littleEndianReader.readUint8();
    expect(value1).toBe(0x00);

    const value2 = littleEndianReader.readUint8();
    expect(value2).toBe(0x01);

    const value3 = littleEndianReader2.readUint8();
    expect(value3).toBe(0xde);

    const value4 = littleEndianReader2.readUint8();
    expect(value4).toBe(0xad);
  });

  it('reads a uint16 in little endian', () => {
    const value1 = littleEndianReader.readUint16();
    expect(value1).toBe(0x0100);

    const value2 = littleEndianReader.readUint16();
    expect(value2).toBe(0x0302);

    const value3 = littleEndianReader2.readUint16();
    expect(value3).toBe(0xadde);

    const value4 = littleEndianReader2.readUint16();
    expect(value4).toBe(0xefbe);
  });

  it('reads a uint32 in little endian', () => {
    const value1 = littleEndianReader.readUint32();
    expect(value1).toBe(0x03020100);

    const value2 = littleEndianReader.readUint32();
    expect(value2).toBe(0x07060504);

    const value3 = littleEndianReader2.readUint32();
    expect(value3).toBe(0xefbeadde);

    const value4 = littleEndianReader2.readUint32();
    expect(value4).toBe(0x0001ffff);
  });

  it('reads an int32 in little endian', () => {
    const value1 = littleEndianReader.readInt32();
    expect(value1).toBe(50462976);

    const value2 = littleEndianReader.readInt32();
    expect(value2).toBe(117835012);

    const value3 = littleEndianReader2.readInt32();
    expect(value3).toBe(-272716322);

    const value4 = littleEndianReader2.readInt32();
    expect(value4).toBe(131071);
  });

  it('reads a uint64 in little endian', () => {
    const value = littleEndianReader2.readUint64();
    expect(value).toBe(0x0001ffffefbeadde);
  });

  it('skips bytes', () => {
    bigEndianReader.skip(1);
    const value = bigEndianReader.readUint8();
    expect(value).toBe(0x01);
  });

  it('determines the end of the data view', () => {
    bigEndianReader.skip(7);
    expect(bigEndianReader.hasMoreData()).toBe(true);

    bigEndianReader.skip(1);
    expect(bigEndianReader.hasMoreData()).toBe(false);
  });

  it('gets the byte position', () => {
    expect(bigEndianReader.getPosition()).toBe(0);

    bigEndianReader.skip(1);
    expect(bigEndianReader.getPosition()).toBe(1);

    bigEndianReader.skip(7);
    expect(bigEndianReader.getPosition()).toBe(8);
  });

  describe('end-of-stream', () => {
    it('detects when reading a uint8', () => {
      bigEndianReader.skip(7);
      bigEndianReader.readUint8();
      runTest(() => {
        bigEndianReader.readUint8();
      });
    });

    it('detects when reading a uint16', () => {
      bigEndianReader.skip(7);
      runTest(() => {
        bigEndianReader.readUint16();
      });
    });

    it('detects when reading a uint32', () => {
      bigEndianReader.skip(5);
      runTest(() => {
        bigEndianReader.readUint32();
      });
    });

    it('detects when reading a int32', () => {
      bigEndianReader.skip(5);
      runTest(() => {
        bigEndianReader.readInt32();
      });
    });

    it('detects when reading a uint64', () => {
      bigEndianReader.skip(3);
      runTest(() => {
        bigEndianReader.readUint64();
      });
    });

    it('detects when skipping bytes', () => {
      bigEndianReader.skip(8);
      runTest(() => {
        bigEndianReader.skip(1);
      });
    });

    it('detects when reading bytes', () => {
      bigEndianReader.skip(8);
      runTest(() => {
        bigEndianReader.readBytes(1);
      });
    });

    function runTest(test) {
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS));
      expect(test).toThrow(expected);
    }
  });

  it('detects uint64s too large for JavaScript', () => {
    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW));

    expect(() => littleEndianReader.readUint64()).toThrow(expected);
    expect(() => bigEndianReader2.readUint64()).toThrow(expected);
  });
});
