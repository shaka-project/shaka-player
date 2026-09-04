/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('LOCMAFParser', isMSFSupported, () => {
  const Field = shaka.msf.LOCMAFParser.Field;
  const Util = shaka.test.Util;

  /** A 90 kHz timescale, so a 3000-tick sample is one 30th of a second. */
  const TIMESCALE = 90000;

  /** @type {!shaka.extern.MsfCodec} */
  let codec;

  beforeEach(() => {
    codec = new shaka.msf.QuicVarIntCodec();
  });

  /**
   * @param {Object=} overrides
   * @return {!shaka.msf.LOCMAFParser.TrackParams}
   */
  function trackParams(overrides) {
    return /** @type {!shaka.msf.LOCMAFParser.TrackParams} */ (Object.assign({
      trackId: 1,
      timescale: TIMESCALE,
      trexSampleDescriptionIndex: 1,
      trexSampleDuration: 0,
      trexSampleSize: 0,
      trexSampleFlags: 0,
      isProtected: false,
      defaultPerSampleIvSize: 0,
    }, overrides || {}));
  }

  /**
   * @param {Object=} overrides Track parameters to change.
   * @return {!shaka.msf.LOCMAFParser}
   */
  function makeParser(overrides) {
    return new shaka.msf.LOCMAFParser(codec, trackParams(overrides));
  }

  /**
   * @param {!Array<number>} values
   * @return {!Uint8Array}
   */
  function varints(values) {
    const writer = new shaka.util.DataViewWriter(
        16, shaka.util.DataViewWriter.Endianness.BIG_ENDIAN);
    for (const value of values) {
      codec.encodeVarInt(writer, BigInt(value));
    }
    return writer.getBytes();
  }

  /**
   * @param {number} value
   * @return {number}
   */
  function zigzag(value) {
    return value >= 0 ? 2 * value : -2 * value - 1;
  }

  /**
   * @param {...!Uint8Array} parts
   * @return {!Uint8Array}
   */
  function concat(...parts) {
    return shaka.util.Uint8ArrayUtils.concat(...parts);
  }

  /**
   * @param {string} name
   * @return {!Uint8Array}
   */
  function fourCC(name) {
    return new Uint8Array([
      name.charCodeAt(0), name.charCodeAt(1),
      name.charCodeAt(2), name.charCodeAt(3),
    ]);
  }

  /**
   * Encodes one (field_id, value) tuple, following the parity rule: an even ID
   * carries a bare vi64, an odd one length-prefixed bytes. The value encoding
   * depends on the header kind, except for the three fields that do not
   * follow it.
   *
   * @param {number} id
   * @param {(number|!Array<number>|!Uint8Array)} value
   * @param {boolean} isDelta
   * @return {!Uint8Array}
   */
  function tuple(id, value, isDelta) {
    if (id % 2 === 0) {
      const scalar = /** @type {number} */ (value);
      return concat(varints([id]),
          varints([isDelta ? zigzag(scalar) : scalar]));
    }

    let bytes;
    if (id === Field.SENC_INITIALIZATION_VECTOR) {
      bytes = /** @type {!Uint8Array} */ (value);
    } else {
      const signed = isDelta ?
          id !== Field.DELTA_DELETED_LOCMAF_IDS :
          id === Field.TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS;
      bytes = varints(/** @type {!Array<number>} */ (value).map(
          (element) => signed ? zigzag(element) : element));
    }
    return concat(varints([id, bytes.byteLength]), bytes);
  }

  /**
   * Builds a header element from an ID-to-value map, in the ascending field
   * order the canonical encoding requires.
   *
   * @param {!Object<number, (number|!Array<number>|!Uint8Array)>} fields
   * @param {boolean} isDelta
   * @return {!Uint8Array}
   */
  function header(fields, isDelta) {
    const ids = Object.keys(fields).map(Number).sort((a, b) => a - b);
    const block = concat(
        ...ids.map((id) => tuple(id, fields[id], isDelta)));
    return concat(
        varints([isDelta ? 3 : 2, block.byteLength]), block);
  }

  /**
   * @param {!Object<number, (number|!Array<number>|!Uint8Array)>} fields
   * @return {!Uint8Array}
   */
  function fullHeader(fields) {
    return header(fields, /* isDelta= */ false);
  }

  /**
   * @param {!Object<number, (number|!Array<number>|!Uint8Array)>} fields
   * @return {!Uint8Array}
   */
  function deltaHeader(fields) {
    return header(fields, /* isDelta= */ true);
  }

  /**
   * @param {string} name
   * @param {!Uint8Array} payload The box contents, without its 8-byte header.
   * @return {!Uint8Array}
   */
  function genBox(name, payload) {
    return concat(
        varints([1, 4 + payload.byteLength]), fourCC(name), payload);
  }

  /**
   * @param {!Uint8Array} boxes
   * @return {!Uint8Array}
   */
  function rawBoxes(boxes) {
    return concat(varints([4]), boxes);
  }

  /**
   * @param {number} length
   * @return {!Uint8Array}
   */
  function payload(length) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = i & 0xff;
    }
    return bytes;
  }

  /**
   * @param {!Uint8Array} data
   * @param {number=} group
   * @param {number=} objectId
   * @return {!shaka.extern.MsfObject}
   */
  function object(data, group = 0, objectId = 0) {
    return {
      trackAlias: BigInt(1),
      location: {
        group: BigInt(group),
        object: BigInt(objectId),
        subgroup: BigInt(0),
      },
      data,
      extensions: null,
      status: null,
      payloadReadStartMs: 0,
      receiveTimestampMs: 0,
    };
  }

  /**
   * Walks a reconstructed chunk, descending into `moof` and `traf`, and
   * returns each box's contents keyed by name -- plus the order the boxes
   * appeared in, which the canonical form pins down.
   *
   * @param {!Uint8Array} data
   * @return {!{order: !Array<string>, boxes: !Map<string, !Uint8Array>}}
   */
  function walk(data) {
    /** @type {!Array<string>} */
    const order = [];
    /** @type {!Map<string, !Uint8Array>} */
    const boxes = new Map();

    const view = shaka.util.BufferUtils.toDataView(data);
    const descend = (start, end) => {
      let offset = start;
      while (offset < end) {
        const size = view.getUint32(offset);
        const name = String.fromCharCode(
            data[offset + 4], data[offset + 5],
            data[offset + 6], data[offset + 7]);
        order.push(name);
        boxes.set(name, data.subarray(offset + 8, offset + size));
        if (name === 'moof' || name === 'traf') {
          descend(offset + 8, offset + size);
        }
        offset += size;
      }
    };
    descend(0, data.byteLength);

    return {order, boxes};
  }

  /**
   * @param {!Uint8Array} bytes
   * @param {number} offset
   * @return {number}
   */
  function uint32(bytes, offset) {
    return shaka.util.BufferUtils.toDataView(bytes).getUint32(offset);
  }

  describe('a full header', () => {
    it('reconstructs the canonical chunk byte for byte', () => {
      // One sample of 3000 ticks at decode time 90000. Its size is not on the
      // wire at all: a single-sample chunk takes it from the payload length.
      const chunk = makeParser().parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5))));

      expect(chunk).not.toBe(null);
      expect(chunk.startTime).toBe(1);
      expect(chunk.duration).toBeCloseTo(1 / 30, 6);

      // moof(96) = header(8) + mfhd(16) + traf(72), then mdat(8 + 5).
      const expected = [
        // moof
        0x00, 0x00, 0x00, 0x60, 0x6d, 0x6f, 0x6f, 0x66,
        // mfhd, whose sequence number is always zero
        0x00, 0x00, 0x00, 0x10, 0x6d, 0x66, 0x68, 0x64,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        // traf
        0x00, 0x00, 0x00, 0x48, 0x74, 0x72, 0x61, 0x66,
        // tfhd: default-base-is-moof, default sample duration and size
        0x00, 0x00, 0x00, 0x18, 0x74, 0x66, 0x68, 0x64,
        0x00, 0x02, 0x00, 0x18,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x0b, 0xb8,
        0x00, 0x00, 0x00, 0x05,
        // tfdt: version 1 always
        0x00, 0x00, 0x00, 0x14, 0x74, 0x66, 0x64, 0x74,
        0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x5f, 0x90,
        // trun: data offset only, pointing just past the mdat header
        0x00, 0x00, 0x00, 0x14, 0x74, 0x72, 0x75, 0x6e,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x68,
        // mdat
        0x00, 0x00, 0x00, 0x0d, 0x6d, 0x64, 0x61, 0x74,
        0x00, 0x01, 0x02, 0x03, 0x04,
      ];
      expect(Array.from(chunk.data)).toEqual(expected);
    });

    it('puts varying sample values in the trun', () => {
      const chunk = makeParser().parse(object(concat(
          fullHeader({
            // Three sizes, of which only the first two travel; the third is
            // whatever is left of the payload.
            [Field.TRUN_SAMPLE_SIZES]: [10, 20],
            [Field.TRUN_SAMPLE_DURATIONS]: [3000, 3000, 6000],
            [Field.TRUN_SAMPLE_COMPOSITION_TIME_OFFSETS]: [0, -3000, 3000],
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 3,
          }),
          payload(60))));

      const {boxes} = walk(chunk.data);
      const trun = boxes.get('trun');
      // Version 1, because a composition offset is negative.
      expect(trun[0]).toBe(1);
      // data-offset, sample-duration, sample-size and offsets present.
      expect(uint32(trun, 0) & 0xffffff).toBe(0x000b01);
      expect(uint32(trun, 4)).toBe(3);
      // Sample records of duration, size and composition offset.
      expect(uint32(trun, 12)).toBe(3000);
      expect(uint32(trun, 16)).toBe(10);
      expect(uint32(trun, 20) | 0).toBe(0);
      expect(uint32(trun, 24)).toBe(3000);
      expect(uint32(trun, 28)).toBe(20);
      expect(uint32(trun, 32) | 0).toBe(-3000);
      expect(uint32(trun, 36)).toBe(6000);
      expect(uint32(trun, 40)).toBe(30);
      expect(uint32(trun, 44) | 0).toBe(3000);

      // No tfhd default duration or size when they vary per sample.
      expect(uint32(boxes.get('tfhd'), 0) & 0xffffff).toBe(0x020000);
      expect(chunk.duration).toBeCloseTo(12000 / TIMESCALE, 6);
    });

    it('reconstructs the first sample flags of a random access chunk', () => {
      const chunk = makeParser({trexSampleFlags: 0x01010000}).parse(
          object(concat(
              fullHeader({
                [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
                [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
                [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
                // The first sample is a sync sample; the rest are not, and
                // their flags already match trex.
                [Field.TRUN_FIRST_SAMPLE_FLAGS]: 0x02000000,
                [Field.TRUN_SAMPLE_COUNT]: 3,
              }),
              payload(30))));

      const {boxes} = walk(chunk.data);
      const trun = boxes.get('trun');
      expect(uint32(trun, 0) & 0xffffff).toBe(0x000005);
      expect(uint32(trun, 12)).toBe(0x02000000);
      // The other samples fall back to trex, so the tfhd carries only the
      // duration and size defaults, not a flags default.
      expect(uint32(boxes.get('tfhd'), 0) & 0xffffff).toBe(0x020018);
    });

    it('ignores an unknown field', () => {
      // A receiver steps over what it does not recognize using the parity
      // rule, so both an even and an odd unknown ID are skippable.
      const chunk = makeParser().parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
            [Field.SENC_PER_SAMPLE_IV_SIZE + 2]: 12345,
            29: [1, 2, 3],
          }),
          payload(5))));

      expect(chunk.startTime).toBe(1);
      expect(walk(chunk.data).order).toEqual(
          ['moof', 'mfhd', 'traf', 'tfhd', 'tfdt', 'trun', 'mdat']);
    });

    it('rejects a header with no sample count', () => {
      const chunk = makeParser().parse(object(concat(
          fullHeader({[Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0}),
          payload(5))));
      expect(chunk).toBe(null);
    });

    it('rejects a repeated field', () => {
      const block = concat(
          tuple(Field.TRUN_SAMPLE_COUNT, 1, false),
          tuple(Field.TRUN_SAMPLE_COUNT, 2, false));
      const chunk = makeParser().parse(object(concat(
          varints([2, block.byteLength]), block, payload(5))));
      expect(chunk).toBe(null);
    });
  });

  describe('a delta header', () => {
    /** @type {!shaka.msf.LOCMAFParser} */
    let parser;

    beforeEach(() => {
      parser = makeParser();
      // Anchor the group: two samples of 3000 ticks at decode time 90000.
      const chunk = parser.parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 0));
      expect(chunk.startTime).toBe(1);
    });

    it('derives the decode time from the previous chunk', () => {
      // The decode time never travels in a delta header at all.
      const chunk = parser.parse(
          object(concat(deltaHeader({}), payload(20)), 7, 1));
      expect(chunk.startTime).toBe((90000 + 6000) / TIMESCALE);

      const next = parser.parse(
          object(concat(deltaHeader({}), payload(20)), 7, 2));
      expect(next.startTime).toBe((90000 + 12000) / TIMESCALE);
    });

    it('inherits every field it does not mention', () => {
      const chunk = parser.parse(
          object(concat(deltaHeader({}), payload(20)), 7, 1));
      const {boxes} = walk(chunk.data);
      expect(uint32(boxes.get('tfhd'), 0) & 0xffffff).toBe(0x020018);
      expect(uint32(boxes.get('tfhd'), 8)).toBe(3000);
      expect(uint32(boxes.get('tfhd'), 12)).toBe(10);
      expect(uint32(boxes.get('trun'), 4)).toBe(2);
    });

    it('adds a signed scalar delta to the previous value', () => {
      const chunk = parser.parse(object(concat(
          deltaHeader({[Field.TFHD_DEFAULT_SAMPLE_DURATION]: -1000}),
          payload(20)), 7, 1));
      expect(uint32(walk(chunk.data).boxes.get('tfhd'), 8)).toBe(2000);
      expect(chunk.duration).toBeCloseTo(4000 / TIMESCALE, 6);
    });

    it('sums a list delta element-wise', () => {
      // Move off the uniform default onto a per-sample list first.
      parser.parse(object(concat(
          fullHeader({
            [Field.TRUN_SAMPLE_DURATIONS]: [3000, 4000],
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 1));

      const chunk = parser.parse(object(concat(
          // A signed delta per element, which must stay non-uniform or the
          // durations would collapse into a tfhd default instead.
          deltaHeader({[Field.TRUN_SAMPLE_DURATIONS]: [500, -1500]}),
          payload(20)), 7, 2));

      const trun = walk(chunk.data).boxes.get('trun');
      expect(uint32(trun, 12)).toBe(3500);
      expect(uint32(trun, 16)).toBe(2500);
      expect(chunk.duration).toBeCloseTo(6000 / TIMESCALE, 6);
    });

    it('takes absolute values for the entries a list grows by', () => {
      parser.parse(object(concat(
          fullHeader({
            [Field.TRUN_SAMPLE_DURATIONS]: [3000, 4000],
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 1));

      const chunk = parser.parse(object(concat(
          deltaHeader({
            [Field.TRUN_SAMPLE_COUNT]: 1,
            // Two element deltas and one absolute value for the new entry.
            [Field.TRUN_SAMPLE_DURATIONS]: [0, 0, 5000],
          }),
          payload(30)), 7, 2));

      const trun = walk(chunk.data).boxes.get('trun');
      expect(uint32(trun, 4)).toBe(3);
      expect(uint32(trun, 12)).toBe(3000);
      expect(uint32(trun, 16)).toBe(4000);
      expect(uint32(trun, 20)).toBe(5000);
    });

    it('truncates a list that shrinks', () => {
      parser.parse(object(concat(
          fullHeader({
            [Field.TRUN_SAMPLE_DURATIONS]: [3000, 4000],
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 1));

      const chunk = parser.parse(object(concat(
          deltaHeader({
            [Field.TRUN_SAMPLE_COUNT]: -1,
            // No bytes are emitted for the entry that goes away.
            [Field.TRUN_SAMPLE_DURATIONS]: [0],
          }),
          payload(10)), 7, 2));

      const {boxes} = walk(chunk.data);
      expect(uint32(boxes.get('trun'), 4)).toBe(1);
      // One sample of 3000 ticks, now uniform, so it moves to the tfhd.
      expect(uint32(boxes.get('tfhd'), 8)).toBe(3000);
      expect(chunk.duration).toBeCloseTo(3000 / TIMESCALE, 6);
    });

    it('applies deletions before deltas', () => {
      // The motivating case: a chunk that drops the first-sample-flags
      // override the previous one set, falling back to trex.
      parser.parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_FIRST_SAMPLE_FLAGS]: 0x02000000,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 1));

      const chunk = parser.parse(object(concat(
          deltaHeader({
            [Field.DELTA_DELETED_LOCMAF_IDS]: [Field.TRUN_FIRST_SAMPLE_FLAGS],
          }),
          payload(20)), 7, 2));

      const trun = walk(chunk.data).boxes.get('trun');
      // first-sample-flags-present is gone; every sample is a trex default.
      expect(uint32(trun, 0) & 0xffffff).toBe(0x000001);
    });

    it('rejects a delta header carrying a decode time', () => {
      const chunk = parser.parse(object(concat(
          deltaHeader({[Field.TFDT_BASE_MEDIA_DECODE_TIME]: 3000}),
          payload(20)), 7, 1));
      expect(chunk).toBe(null);
    });

    it('rejects a delta with no reference', () => {
      const fresh = makeParser();
      const chunk = fresh.parse(object(concat(
          deltaHeader({[Field.TRUN_SAMPLE_COUNT]: 1}), payload(5)), 7, 3));
      expect(chunk).toBe(null);
    });

    it('rejects a list whose length no longer matches the sample count', () => {
      parser.parse(object(concat(
          fullHeader({
            [Field.TRUN_SAMPLE_DURATIONS]: [3000, 4000],
            [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 10,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(20)), 7, 1));

      // The sample count changed but the duration list was not re-emitted.
      const chunk = parser.parse(object(concat(
          deltaHeader({[Field.TRUN_SAMPLE_COUNT]: 1}),
          payload(30)), 7, 2));
      expect(chunk).toBe(null);
    });
  });

  describe('sample size derivation', () => {
    /**
     * @param {!Object<number, (number|!Array<number>|!Uint8Array)>} fields
     * @param {number} payloadLength
     * @param {Object=} params
     * @return {?shaka.msf.LOCMAFParser.Chunk}
     */
    function parseWith(fields, payloadLength, params) {
      const all = Object.assign({
        [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
        [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
      }, fields);
      return makeParser(params).parse(
          object(concat(fullHeader(all), payload(payloadLength))));
    }

    it('takes the last size from the payload length', () => {
      const chunk = parseWith({
        [Field.TRUN_SAMPLE_SIZES]: [10, 20],
        [Field.TRUN_SAMPLE_COUNT]: 3,
      }, 60);
      const trun = walk(chunk.data).boxes.get('trun');
      expect(uint32(trun, 12)).toBe(10);
      expect(uint32(trun, 16)).toBe(20);
      expect(uint32(trun, 20)).toBe(30);
    });

    it('uses the tfhd default for uniform sizes', () => {
      const chunk = parseWith({
        [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 15,
        [Field.TRUN_SAMPLE_COUNT]: 4,
      }, 60);
      expect(uint32(walk(chunk.data).boxes.get('tfhd'), 12)).toBe(15);
    });

    it('uses the payload length for a single sample', () => {
      const chunk = parseWith({[Field.TRUN_SAMPLE_COUNT]: 1}, 42);
      expect(uint32(walk(chunk.data).boxes.get('tfhd'), 12)).toBe(42);
    });

    it('falls back to the trex default', () => {
      const chunk = parseWith({[Field.TRUN_SAMPLE_COUNT]: 4}, 60,
          {trexSampleSize: 15});
      const {boxes} = walk(chunk.data);
      // The size equals the trex default, so it stays out of the tfhd.
      expect(uint32(boxes.get('tfhd'), 0) & 0xffffff).toBe(0x020008);
      expect(uint32(boxes.get('trun'), 4)).toBe(4);
    });

    it('allows zero-size samples on an empty payload', () => {
      const chunk = parseWith({[Field.TRUN_SAMPLE_COUNT]: 3}, 0);
      const {boxes} = walk(chunk.data);
      expect(uint32(boxes.get('tfhd'), 0) & 0xffffff).toBe(0x020008);
      expect(boxes.get('mdat').byteLength).toBe(0);
    });

    it('rejects a chunk with no derivable sizes', () => {
      expect(parseWith({[Field.TRUN_SAMPLE_COUNT]: 4}, 60)).toBe(null);
    });

    it('rejects sizes that exceed the payload', () => {
      expect(parseWith({
        [Field.TRUN_SAMPLE_SIZES]: [40, 40],
        [Field.TRUN_SAMPLE_COUNT]: 3,
      }, 60)).toBe(null);
    });

    it('rejects a default that does not fill the payload', () => {
      expect(parseWith({
        [Field.TFHD_DEFAULT_SAMPLE_SIZE]: 15,
        [Field.TRUN_SAMPLE_COUNT]: 3,
      }, 60)).toBe(null);
    });

    it('rejects samples with a payload but no count', () => {
      expect(parseWith({[Field.TRUN_SAMPLE_COUNT]: 0}, 60)).toBe(null);
    });
  });

  describe('generic boxes', () => {
    it('wraps each one back into an ISO box ahead of the moof', () => {
      const chunk = makeParser().parse(object(concat(
          genBox('styp', fourCC('cmfs')),
          genBox('prft', payload(16)),
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5))));

      const {order, boxes} = walk(chunk.data);
      expect(order).toEqual(['styp', 'prft', 'moof', 'mfhd', 'traf', 'tfhd',
        'tfdt', 'trun', 'mdat']);
      expect(Array.from(boxes.get('styp'))).toEqual(
          Array.from(fourCC('cmfs')));
      expect(boxes.get('prft').byteLength).toBe(16);

      // The genBoxes sit ahead of the moof, so they do not shift the sample
      // data offset, which is measured from the moof.
      expect(uint32(boxes.get('trun'), 8)).toBe(96 + 8);
    });

    it('rejects a genBox that follows the header', () => {
      const chunk = makeParser().parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          // A genBox here is indistinguishable from sample data, so it is
          // simply appended as such rather than rejected: the header is the
          // last element by definition.
          payload(5))));
      expect(chunk.data.byteLength).toBe(96 + 8 + 5);
    });

    it('rejects a genBox smaller than its FourCC', () => {
      const chunk = makeParser().parse(object(concat(
          varints([1, 3]), fourCC('styp').subarray(0, 3),
          fullHeader({[Field.TRUN_SAMPLE_COUNT]: 1}), payload(5))));
      expect(chunk).toBe(null);
    });
  });

  describe('raw boxes', () => {
    it('passes a verbatim chunk through', () => {
      // Take a reconstructed chunk and feed its bytes back as rawBoxes.
      const source = makeParser().parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5))));

      const chunk = makeParser().parse(object(rawBoxes(source.data)));
      expect(chunk).not.toBe(null);
      expect(chunk.startTime).toBe(1);
      expect(Array.from(chunk.data)).toEqual(Array.from(source.data));
    });

    it('ignores boxes with no media timing', () => {
      // An ftyp is legal in a rawBoxes object -- self-framed carriage puts
      // the initialization bytes there -- but there is nothing to append.
      const ftyp = concat(
          new Uint8Array([0, 0, 0, 16]), fourCC('ftyp'),
          fourCC('cmfc'), new Uint8Array([0, 0, 0, 0]));
      expect(makeParser().parse(object(rawBoxes(ftyp)))).toBe(null);
    });

    it('makes the next header in the group a full one', () => {
      const parser = makeParser();
      parser.parse(object(concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5)), 3, 0));

      const ftyp = concat(
          new Uint8Array([0, 0, 0, 12]), fourCC('ftyp'), fourCC('cmfc'));
      parser.parse(object(rawBoxes(ftyp), 3, 1));

      // The reference is gone, so a delta cannot be applied.
      expect(parser.parse(object(concat(deltaHeader({}), payload(5)), 3, 2)))
          .toBe(null);
    });

    it('rejects an empty rawBoxes element', () => {
      expect(makeParser().parse(object(varints([4])))).toBe(null);
    });

    it('rejects a rawBoxes element after another element', () => {
      const chunk = makeParser().parse(object(concat(
          genBox('styp', fourCC('cmfs')),
          rawBoxes(concat(
              new Uint8Array([0, 0, 0, 12]), fourCC('ftyp'),
              fourCC('cmfc'))))));
      expect(chunk).toBe(null);
    });
  });

  describe('delivery gaps', () => {
    /** @type {!shaka.msf.LOCMAFParser} */
    let parser;

    /** @return {!Uint8Array} */
    function anchor() {
      return concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5));
    }

    beforeEach(() => {
      parser = makeParser();
      parser.parse(object(anchor(), 4, 0));
    });

    it('stops applying deltas after a hole in the object IDs', () => {
      // Object 1 never arrived, so object 2's delta would be applied to the
      // wrong reference.
      expect(parser.parse(object(concat(deltaHeader({}), payload(5)), 4, 2)))
          .toBe(null);
    });

    it('resumes at the next full header', () => {
      parser.parse(object(concat(deltaHeader({}), payload(5)), 4, 3));
      const chunk = parser.parse(object(anchor(), 4, 4));
      expect(chunk.startTime).toBe(1);
    });

    it('does not treat an empty status object as a hole', () => {
      parser.parse(object(new Uint8Array(0), 4, 1));
      const chunk = parser.parse(
          object(concat(deltaHeader({}), payload(5)), 4, 2));
      expect(chunk.startTime).toBe((90000 + 3000) / TIMESCALE);
    });

    it('re-anchors on a new group', () => {
      // A new group always starts with a full header, so the object IDs
      // restarting is not a hole.
      const chunk = parser.parse(object(anchor(), 5, 0));
      expect(chunk.startTime).toBe(1);
    });
  });

  describe('common encryption', () => {
    /**
     * Two samples, each with one subsample and an 8-byte IV.
     * @return {!Uint8Array}
     */
    function protectedChunk() {
      return concat(
          fullHeader({
            [Field.TRUN_SAMPLE_SIZES]: [116],
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array([
              1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2,
            ]),
            [Field.SENC_SUBSAMPLE_COUNT]: [1, 1],
            [Field.SENC_BYTES_OF_CLEAR_DATA]: [16, 16],
            [Field.SENC_BYTES_OF_PROTECTED_DATA]: [100, 200],
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
            [Field.TRUN_SAMPLE_COUNT]: 2,
          }),
          payload(332));
    }

    it('rebuilds senc, saiz and saio', () => {
      const chunk = makeParser({isProtected: true, defaultPerSampleIvSize: 8})
          .parse(object(protectedChunk()));

      const {order, boxes} = walk(chunk.data);
      // The canonical form fixes this order.
      expect(order).toEqual(['moof', 'mfhd', 'traf', 'tfhd', 'tfdt', 'trun',
        'saiz', 'saio', 'senc', 'mdat']);

      const senc = boxes.get('senc');
      // senc_use_subsamples
      expect(uint32(senc, 0) & 0xffffff).toBe(0x000002);
      expect(uint32(senc, 4)).toBe(2);
      // Sample 0: eight IV bytes, one subsample of 16 clear and 100 crypt.
      expect(Array.from(senc.subarray(8, 16))).toEqual([1, 1, 1, 1, 1, 1,
        1, 1]);
      expect((senc[16] << 8) | senc[17]).toBe(1);
      expect((senc[18] << 8) | senc[19]).toBe(16);
      expect(uint32(senc, 20)).toBe(100);
      // Sample 1 follows immediately.
      expect(Array.from(senc.subarray(24, 32))).toEqual([2, 2, 2, 2, 2, 2,
        2, 2]);
      expect(uint32(senc, 36)).toBe(200);

      const saiz = boxes.get('saiz');
      // Both samples need 8 IV bytes + 2 count bytes + one 6-byte record, so
      // one default covers them and no per-sample array is written.
      expect(saiz[4]).toBe(16);
      expect(uint32(saiz, 5)).toBe(2);
      expect(saiz.byteLength).toBe(9);

      const saio = boxes.get('saio');
      expect(uint32(saio, 4)).toBe(1);
      // The offset lands on the first sample's IV, measured from the moof.
      const sencStart = uint32(saio, 8) - 16;
      const moof = boxes.get('moof');
      expect(String.fromCharCode(...moof.subarray(sencStart - 4,
          sencStart))).toBe('senc');
      expect(uint32(saio, 8)).toBe(153);
    });

    it('writes a per-sample saiz array when the sizes differ', () => {
      const chunk = makeParser({isProtected: true, defaultPerSampleIvSize: 8})
          .parse(object(concat(
              fullHeader({
                [Field.TRUN_SAMPLE_SIZES]: [116],
                [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
                [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array(16),
                [Field.SENC_SUBSAMPLE_COUNT]: [1, 2],
                [Field.SENC_BYTES_OF_CLEAR_DATA]: [16, 16, 16],
                [Field.SENC_BYTES_OF_PROTECTED_DATA]: [100, 50, 150],
                [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
                [Field.TRUN_SAMPLE_COUNT]: 2,
              }),
              payload(332))));

      const saiz = walk(chunk.data).boxes.get('saiz');
      expect(saiz[4]).toBe(0);
      expect(uint32(saiz, 5)).toBe(2);
      expect(Array.from(saiz.subarray(9))).toEqual([16, 22]);
    });

    it('writes no CENC boxes under a constant IV with no subsamples', () => {
      // cbcs full-sample encryption: the IV lives in the initialization
      // segment and no per-sample auxiliary information exists.
      const chunk = makeParser({isProtected: true, defaultPerSampleIvSize: 0})
          .parse(object(concat(
              fullHeader({
                [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
                [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
                [Field.TRUN_SAMPLE_COUNT]: 1,
              }),
              payload(5))));

      expect(walk(chunk.data).order).toEqual(
          ['moof', 'mfhd', 'traf', 'tfhd', 'tfdt', 'trun', 'mdat']);
    });

    it('inherits the CENC fields a delta chunk leaves out', () => {
      const parser = makeParser(
          {isProtected: true, defaultPerSampleIvSize: 8});
      parser.parse(object(protectedChunk(), 1, 0));

      // Only the IVs change from chunk to chunk, and they are overwritten
      // rather than differenced.
      const chunk = parser.parse(object(concat(
          deltaHeader({
            [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array([
              9, 9, 9, 9, 9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8,
            ]),
          }),
          payload(332)), 1, 1));

      const senc = walk(chunk.data).boxes.get('senc');
      expect(Array.from(senc.subarray(8, 16))).toEqual([9, 9, 9, 9, 9, 9,
        9, 9]);
      // The subsample map carried over untouched.
      expect(uint32(senc, 20)).toBe(100);
      expect(uint32(senc, 36)).toBe(200);
    });

    it('rejects CENC fields on a clear track', () => {
      const chunk = makeParser().parse(object(protectedChunk()));
      expect(chunk).toBe(null);
    });

    it('rejects an IV list that does not match the sample count', () => {
      const chunk = makeParser({isProtected: true, defaultPerSampleIvSize: 8})
          .parse(object(concat(
              fullHeader({
                [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
                [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array(8),
                [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
                [Field.TRUN_SAMPLE_COUNT]: 2,
              }),
              payload(20))));
      expect(chunk).toBe(null);
    });
  });

  describe('the draft-18 codec', () => {
    it('reads the same fields under the newer varint encoding', () => {
      // The spec defines its vi64 by reference to MOQT's own encoding, which
      // changed in draft-17, so the same numbers are different bytes.
      const quic = new shaka.msf.QuicVarIntCodec();
      codec = new shaka.msf.draft18.Codec();

      const draft18Object = concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5));

      const chunk = makeParser().parse(object(draft18Object));
      expect(chunk.startTime).toBe(1);
      expect(chunk.data.byteLength).toBe(96 + 8 + 5);

      // The bytes really do differ, so this is not a vacuous pass.
      codec = quic;
      const quicObject = concat(
          fullHeader({
            [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
            [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
            [Field.TRUN_SAMPLE_COUNT]: 1,
          }),
          payload(5));
      expect(Array.from(draft18Object)).not.toEqual(Array.from(quicObject));

      // And the reconstruction from each is identical.
      const other = makeParser().parse(object(quicObject));
      expect(Array.from(other.data)).toEqual(Array.from(chunk.data));
    });
  });

  it('ignores an object with an empty payload', () => {
    expect(makeParser().parse(object(new Uint8Array(0)))).toBe(null);
    expect(Util).toBeDefined();
  });
});
