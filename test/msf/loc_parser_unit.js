/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LOCParser', () => {
  /** AAC at 48 kHz: 1024 samples per frame. */
  const FRAME = 1024 / 48000;

  /**
   * @param {number} frameDuration
   * @param {string=} normalizedCodec
   * @param {shaka.extern.MsfCodec=} codec Defaults to the encoding every
   *   draft up to 16 used.
   * @return {!shaka.msf.LOCParser}
   */
  function locParser(frameDuration, normalizedCodec, codec) {
    return new shaka.msf.LOCParser(
        codec || new shaka.msf.QuicVarIntCodec(), frameDuration,
        normalizedCodec);
  }

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
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x08, value: 1000},
        {type: 0x10, value: 5000},
      ]));

      // 5000 / 1000, not 5000 / 1e6 and not the group fallback.
      expect(result.startTime).toBeCloseTo(5, 6);
    });

    it('reads a lone property as an absolute type', () => {
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x10, value: 2500000}]));
      expect(result.startTime).toBeCloseTo(2.5, 6);
    });

    it('does not bind a delta to an unrelated property', () => {
      // Read absolutely, the second pair's delta of 8 would be taken as
      // Timescale (0x08) and the timeline would be out by a factor of 125000.
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x08, value: 90000},
        {type: 0x10, value: 90000},
      ]));
      expect(result.startTime).toBeCloseTo(1, 6);
    });
  });

  describe('variable-length integer encoding', () => {
    /**
     * Encodes a draft-18 variable-length integer, whose length is the count of
     * leading 1 bits of the first byte plus one (draft-18 section 1.4.1).
     *
     * @param {bigint} value
     * @return {!Uint8Array}
     */
    function varint18(value) {
      let length = 1;
      while (length < 9 && value >= (BigInt(1) << BigInt(7 * length))) {
        length++;
      }
      const bytes = new Uint8Array(length);
      for (let i = length - 1; i >= 0; i--) {
        bytes[i] = Number((value >> BigInt(8 * (length - 1 - i))) &
            BigInt(0xff));
      }
      if (length == 9) {
        return shaka.util.Uint8ArrayUtils.concat(
            new Uint8Array([0xff]), bytes.subarray(1));
      }
      bytes[0] |= (0xff << (9 - length)) & 0xff;
      return bytes;
    }

    /**
     * @param {!Uint8Array} extensions
     * @return {!shaka.msf.Utils.MOQObject}
     */
    function objectWith(extensions) {
      const obj = moqObject([]);
      obj.extensions = extensions;
      return obj;
    }

    /** A Timestamp property holding wall-clock microseconds. */
    const timestampUs = BigInt(1788270271000000);
    const block18 = shaka.util.Uint8ArrayUtils.concat(
        varint18(BigInt(0x10)), varint18(timestampUs));

    it('reads draft-18 properties with the draft-18 codec', () => {
      const parser =
          locParser(FRAME, undefined, new shaka.msf.draft18.Codec());
      const result = parser.parse(objectWith(block18));
      expect(result.startTime).toBeCloseTo(1788270271, 3);
    });

    it('misreads draft-18 properties with the draft-16 codec', () => {
      // Not a wish, a warning: both codecs decode these bytes without
      // complaint, so nothing but the negotiated draft says which is right.
      // The QUIC reader takes 0xfe as a two-bit length tag of 0b11 and keeps
      // 62 bits of a byte that is all prefix, and the timeline lands three
      // orders of magnitude away.
      const parser = locParser(FRAME);
      const result = parser.parse(objectWith(block18));
      expect(result.startTime).not.toBeCloseTo(1788270271, 3);
    });

    it('reads draft-16 properties with the draft-16 codec', () => {
      const block16 = shaka.util.Uint8ArrayUtils.concat(
          varint(BigInt(0x10)), varint(timestampUs));
      const parser = locParser(FRAME);
      const result = parser.parse(objectWith(block16));
      expect(result.startTime).toBeCloseTo(1788270271, 3);
    });
  });

  describe('timestamp property ID', () => {
    it('reads the draft-04 ID (0x10)', () => {
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x10, value: 1500000}]));
      expect(result.startTime).toBeCloseTo(1.5, 6);
    });

    it('reads the legacy draft-02 ID (0x06)', () => {
      // moqlivemock publishes this one.
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([{type: 0x06, value: 1500000}]));
      expect(result.startTime).toBeCloseTo(1.5, 6);
    });

    it('prefers the draft-04 ID when both are present', () => {
      const parser = locParser(FRAME);
      const result = parser.parse(moqObject([
        {type: 0x06, value: 1000000},
        {type: 0x10, value: 3000000},
      ]));
      expect(result.startTime).toBeCloseTo(3, 6);
    });

    it('falls back to the group number when neither is present', () => {
      const parser = locParser(FRAME);
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
      const parser = locParser(FRAME);
      const result = parser.parse(
          moqObject([{type: 0x10, value: 1000000}], aac));
      expect(result.payload).toEqual(aac);
    });

    it('passes a length-prefixed NALU payload through untouched', () => {
      const avc = new Uint8Array([0, 0, 0, 2, 0x65, 0x88]);
      const parser = locParser(FRAME);
      const result = parser.parse(
          moqObject([{type: 0x10, value: 1000000}], avc));
      expect(result.payload).toEqual(avc);
    });
  });

  describe('video config', () => {
    const SPS = new Uint8Array([0x67, 0x42, 0xc0, 0x1e]);
    const PPS = new Uint8Array([0x68, 0xce, 0x3c, 0x80]);
    const VPS = new Uint8Array([0x40, 0x01, 0x0c, 0x01]);
    const slice = new Uint8Array([0, 0, 0, 2, 0x65, 0x88]);

    /**
     * Builds an AVCDecoderConfigurationRecord (ISO/IEC 14496-15 §5.3.3.1).
     *
     * @param {number=} version
     * @return {!Uint8Array}
     */
    function avcc(version) {
      return shaka.util.Uint8ArrayUtils.concat(
          new Uint8Array([
            version === undefined ? 1 : version,
            0x42, 0xc0, 0x1e,
            0xff, // lengthSizeMinusOne
            0xe1, // numOfSPS = 1
            0x00, SPS.byteLength,
          ]),
          SPS,
          new Uint8Array([0x01, 0x00, PPS.byteLength]),
          PPS);
    }

    /**
     * Builds an HEVCDecoderConfigurationRecord (ISO/IEC 14496-15 §8.3.3.1):
     * 22 bytes of fixed fields, numOfArrays, then one array per NAL type.
     *
     * @return {!Uint8Array}
     */
    function hvcc() {
      const fixed = new Uint8Array(22);
      fixed[0] = 1;
      /** @type {!Array<!Uint8Array>} */
      const arrays = [];
      // NAL_unit_type 32 = VPS, 33 = SPS, 34 = PPS.
      const entries = [[32, VPS], [33, SPS], [34, PPS]];
      for (const [type, nalu] of entries) {
        arrays.push(shaka.util.Uint8ArrayUtils.concat(
            new Uint8Array([
              0x80 | type, // array_completeness + NAL_unit_type
              0x00, 0x01, // numNalus
              0x00, nalu.byteLength,
            ]),
            nalu));
      }
      return shaka.util.Uint8ArrayUtils.concat(
          fixed, new Uint8Array([arrays.length]), ...arrays);
    }

    /**
     * @param {!Array<!Uint8Array>} paramSets
     * @return {!Uint8Array}
     */
    function expectedPayload(paramSets) {
      /** @type {!Array<!Uint8Array>} */
      const chunks = [];
      for (const ps of paramSets) {
        chunks.push(new Uint8Array([0, 0, 0, ps.byteLength]));
        chunks.push(ps);
      }
      chunks.push(slice);
      return shaka.util.Uint8ArrayUtils.concat(...chunks);
    }

    it('restores AVC parameter sets stripped from the bitstream', () => {
      const parser = locParser(FRAME, 'avc');
      const result = parser.parse(moqObject([
        {type: 0x0d, value: avcc()},
        {type: 0x10, value: 1000000},
      ], slice));
      expect(result.payload).toEqual(expectedPayload([SPS, PPS]));
      expect(result.startTime).toBeCloseTo(1, 6);
    });

    it('restores HEVC parameter sets stripped from the bitstream', () => {
      const parser = locParser(FRAME, 'hevc');
      const result = parser.parse(moqObject([
        {type: 0x0d, value: hvcc()},
        {type: 0x10, value: 1000000},
      ], slice));
      expect(result.payload).toEqual(expectedPayload([VPS, SPS, PPS]));
    });

    it('leaves the payload alone when no config is carried', () => {
      // moqlivemock and any publisher using LOC-04 2.1.1 send parameter sets
      // in the bitstream, so this is the common case.
      const parser = locParser(FRAME, 'avc');
      const result = parser.parse(
          moqObject([{type: 0x10, value: 1000000}], slice));
      expect(result.payload).toEqual(slice);
    });

    it('leaves the payload alone for a codec with no record layout', () => {
      const parser = locParser(FRAME, 'aac');
      const result = parser.parse(moqObject([
        {type: 0x0d, value: avcc()},
        {type: 0x10, value: 1000000},
      ], slice));
      expect(result.payload).toEqual(slice);
    });

    it('leaves the payload alone when the record version is unknown', () => {
      const parser = locParser(FRAME, 'avc');
      const result = parser.parse(moqObject([
        {type: 0x0d, value: avcc(/* version= */ 2)},
        {type: 0x10, value: 1000000},
      ], slice));
      expect(result.payload).toEqual(slice);
    });

    it('leaves the payload alone when the record is truncated', () => {
      // A bad config must degrade to the previous behaviour, never corrupt
      // the bitstream.
      const parser = locParser(FRAME, 'avc');
      const short = avcc().subarray(0, 9);
      const result = parser.parse(moqObject([
        {type: 0x0d, value: short},
        {type: 0x10, value: 1000000},
      ], slice));
      expect(result.payload).toEqual(slice);
    });
  });

  describe('reference timeline', () => {
    /**
     * @param {!shaka.msf.LOCParser} parser
     * @param {!Array<number>} timestampsUs
     * @return {!Array<{startTime: number, duration: number}>}
     */
    function parseAll(parser, timestampsUs) {
      return timestampsUs.map((ts) => parser.parse(
          moqObject([{type: 0x10, value: Math.round(ts)}])));
    }

    /**
     * @param {!Array<{startTime: number, duration: number}>} refs
     * @return {number}
     */
    function discontinuities(refs) {
      let count = 0;
      for (let i = 1; i < refs.length; i++) {
        const prevEnd = refs[i - 1].startTime + refs[i - 1].duration;
        if (Math.abs(refs[i].startTime - prevEnd) > 1e-9) {
          count++;
        }
      }
      return count;
    }

    it('closes the gaps left by an exact but inexpressible clock', () => {
      // A frame of 1024/48000 s is not a whole number of microseconds, so
      // even a publisher whose timestamps are exact leaves sub-microsecond
      // gaps — and SegmentIndex.find() misses a hole of any width.
      const base = 1787902100000000;
      const timestamps = [];
      for (let i = 0; i < 60; i++) {
        timestamps.push(Math.floor(base + i * 1024 * 1e6 / 48000));
      }

      const parser = locParser(FRAME);
      expect(discontinuities(parseAll(parser, timestamps))).toBe(0);
    });

    it('produces a contiguous timeline from a jittery clock', () => {
      const parser = locParser(FRAME);
      const steps = [20400, 20300, 20500, 20200, 20400, 20500, 20300, 20400];
      const timestamps = [];
      let ts = 1787902100000000;
      for (const step of steps) {
        timestamps.push(ts);
        ts += step;
      }
      expect(discontinuities(parseAll(parser, timestamps))).toBe(0);
    });

    it('absorbs jitter wider than one frame', () => {
      // Jitter is not bounded by a fraction of a frame, so the tolerance is
      // floored in the time domain rather than counted in frames.
      const parser = locParser(FRAME);
      const steps = [30500, 20400, 30800, 20300, 30500, 20400];
      const timestamps = [];
      let ts = 1787902100000000;
      for (const step of steps) {
        timestamps.push(ts);
        ts += step;
      }
      expect(discontinuities(parseAll(parser, timestamps))).toBe(0);
    });

    it('resyncs on a real discontinuity instead of snapping', () => {
      const parser = locParser(FRAME);
      const base = 1787902100000000;
      const first = parser.parse(moqObject([{type: 0x10, value: base}]));
      const jumped = base + 5000000;
      const after = parser.parse(moqObject([{type: 0x10, value: jumped}]));

      expect(after.startTime).toBeCloseTo(jumped / 1e6, 6);
      expect(after.startTime).toBeGreaterThan(first.startTime + 1);
    });

    it('stops snapping just past the tolerance', () => {
      const parser = locParser(FRAME);
      const base = 1787902100000000;
      parser.parse(moqObject([{type: 0x10, value: base}]));

      // The tolerance is the time-domain floor here, because two frames of
      // 48 kHz AAC is 42.7 ms.
      const toleranceUs = 0.06 * 1e6;
      const farUs = Math.round(base + FRAME * 1e6 + toleranceUs + 1000);
      const far = parser.parse(moqObject([{type: 0x10, value: farUs}]));
      expect(far.startTime).toBeCloseTo(farUs / 1e6, 6);
    });

    it('uses the frame-based tolerance for long frames', () => {
      // Two frames of 4 fps video is 500 ms, well past the 60 ms floor, so a
      // 400 ms excursion must still be treated as jitter.
      const longFrame = 0.25;
      const parser = locParser(longFrame);
      const base = 1787902100000000;
      parser.parse(moqObject([{type: 0x10, value: base}]));

      const nextUs = Math.round(base + longFrame * 1e6 + 400000);
      const next = parser.parse(moqObject([{type: 0x10, value: nextUs}]));
      expect(next.startTime).toBeCloseTo(base / 1e6 + longFrame, 6);
    });

    it('snaps the group-number fallback too', () => {
      // A track with no Timestamp still has to produce a usable timeline.
      const parser = locParser(FRAME);
      const refs = [];
      for (let group = 0; group < 5; group++) {
        refs.push(parser.parse(
            moqObject([], undefined, /* group= */ group)));
      }
      expect(discontinuities(refs)).toBe(0);
    });
  });

  describe('malformed properties', () => {
    it('falls back to the group number when the block is truncated', () => {
      const obj = moqObject([{type: 0x10, value: 1000000}],
          undefined, /* group= */ 3);
      // Cut the value short so readVi64At_ underflows.
      obj.extensions = obj.extensions.subarray(0, 1);
      const parser = locParser(FRAME);
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
      const parser = locParser(FRAME);
      const result = parser.parse(obj);
      expect(result.startTime).toBeCloseTo(1, 6);
    });
  });
});
