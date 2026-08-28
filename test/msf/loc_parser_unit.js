/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LOCParser', () => {
  /** AAC at 48 kHz: 1024 samples per frame. */
  const FRAME = 1024 / 48000;

  /**
   * Encodes a QUIC variable-length integer (RFC 9000 §16).
   *
   * @param {bigint} value
   * @return {!Uint8Array}
   */
  function varint(value) {
    if (value < BigInt(64)) {
      return new Uint8Array([Number(value)]);
    }
    if (value < BigInt(16384)) {
      const v = Number(value);
      return new Uint8Array([0x40 | (v >> 8), v & 0xff]);
    }
    if (value < BigInt(1073741824)) {
      const v = Number(value);
      return new Uint8Array([
        0x80 | (v >>> 24), (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff,
      ]);
    }
    const bytes = new Uint8Array(8);
    let v = value;
    for (let i = 7; i >= 0; i--) {
      bytes[i] = Number(v & BigInt(0xff));
      v >>= BigInt(8);
    }
    bytes[0] |= 0xc0;
    return bytes;
  }

  /**
   * Builds a MOQ Object Properties block from key-value pairs, delta encoding
   * the types the way draft-ietf-moq-transport-18 §1.4.3 requires.
   *
   * @param {!Array<{type: number, value: (number|!Uint8Array)}>} pairs
   *   Must be in ascending type order, as a real publisher writes them.
   * @return {!Uint8Array}
   */
  function properties(pairs) {
    /** @type {!Array<!Uint8Array>} */
    const chunks = [];
    let previousType = 0;
    for (const pair of pairs) {
      chunks.push(varint(BigInt(pair.type - previousType)));
      previousType = pair.type;
      const bytes = ArrayBuffer.isView(pair.value) ?
          /** @type {!Uint8Array} */ (pair.value) :
          null;
      if (bytes) {
        chunks.push(varint(BigInt(bytes.byteLength)));
        chunks.push(bytes);
      } else {
        chunks.push(varint(BigInt(/** @type {number} */ (pair.value))));
      }
    }
    return shaka.util.Uint8ArrayUtils.concat(...chunks);
  }

  /**
   * @param {!Array<{type: number, value: (number|!Uint8Array)}>} pairs
   * @param {!Uint8Array=} payload
   * @param {number=} group
   * @return {!shaka.msf.Utils.MOQObject}
   */
  function moqObject(pairs, payload, group) {
    return /** @type {!shaka.msf.Utils.MOQObject} */ ({
      trackAlias: BigInt(1),
      location: {
        group: BigInt(group || 0),
        object: BigInt(0),
        subgroup: BigInt(0),
      },
      data: payload || new Uint8Array([0x21, 0x11, 0x45]),
      extensions: properties(pairs),
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    });
  }

  describe('object property types', () => {
    it('delta decodes the type of every property after the first', () => {
      // Timestamp (0x10) then Timescale (0x08) cannot both be expressed by an
      // absolute reader: written in ascending order the deltas are 8 and 8.
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x08, value: 1000},
        {type: 0x10, value: 5000},
      ]));

      // 5000 / 1000, not 5000 / 1e6 and not the group fallback.
      expect(result.startTime).toBeCloseTo(5, 6);
    });

    it('reads a lone property as an absolute type', () => {
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x10, value: 2500000}]));
      expect(result.startTime).toBeCloseTo(2.5, 6);
    });

    it('does not bind a delta to an unrelated property', () => {
      // Read absolutely, the second pair's delta of 8 would be taken as
      // Timescale (0x08) and the timeline would be out by a factor of 125000.
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x08, value: 90000},
        {type: 0x10, value: 90000},
      ]));
      expect(result.startTime).toBeCloseTo(1, 6);
    });
  });

  describe('timestamp property ID', () => {
    it('reads the draft-04 ID (0x10)', () => {
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x10, value: 1500000}]));
      expect(result.startTime).toBeCloseTo(1.5, 6);
    });

    it('reads the legacy draft-02 ID (0x06)', () => {
      // moqlivemock publishes this one.
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x06, value: 1500000}]));
      expect(result.startTime).toBeCloseTo(1.5, 6);
    });

    it('prefers the draft-04 ID when both are present', () => {
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x06, value: 1000000},
        {type: 0x10, value: 3000000},
      ]));
      expect(result.startTime).toBeCloseTo(3, 6);
    });

    it('falls back to the group number when neither is present', () => {
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(
          moqObject([{type: 0x0c, value: 42}], undefined, /* group= */ 7));
      expect(result.startTime).toBeCloseTo(7 * FRAME, 9);
    });
  });

  describe('payload', () => {
    it('passes the object payload through untouched', () => {
      // A stereo AAC-LC raw_data_block starts with 0x20/0x21, which the old
      // private-properties strip read as a count of 32/33 and tried to parse
      // as key-value pairs.
      const aac = new Uint8Array([0x21, 0x11, 0x45, 0x00, 0x14, 0x50]);
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(
          moqObject([{type: 0x10, value: 1000000}], aac));
      expect(result.payload).toEqual(aac);
    });

    it('passes a length-prefixed NALU payload through untouched', () => {
      const avc = new Uint8Array([0, 0, 0, 2, 0x65, 0x88]);
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(
          moqObject([{type: 0x10, value: 1000000}], avc));
      expect(result.payload).toEqual(avc);
    });
  });

  describe('malformed properties', () => {
    it('falls back to the group number when the block is truncated', () => {
      const obj = moqObject([{type: 0x10, value: 1000000}],
          undefined, /* group= */ 3);
      // Cut the value short so readVi64At_ underflows.
      obj.extensions = obj.extensions.subarray(0, 1);
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(obj);
      expect(result.startTime).toBeCloseTo(3 * FRAME, 9);
    });

    it('keeps the properties parsed before a truncation', () => {
      const full = properties([
        {type: 0x10, value: 1000000},
        {type: 0x11, value: new Uint8Array([1, 2, 3, 4])},
      ]);
      const obj = moqObject([]);
      // Drop the trailing byte-string value, keeping the Timestamp intact.
      obj.extensions = full.subarray(0, full.byteLength - 2);
      const parser = new shaka.msf.LOCParser(FRAME);
      const result = parser.parse(obj);
      expect(result.startTime).toBeCloseTo(1, 6);
    });
  });
});
