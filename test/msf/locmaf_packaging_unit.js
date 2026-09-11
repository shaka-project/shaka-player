/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.Locmaf', isMSFSupported, () => {
  const Field = shaka.msf.LOCMAFParser.Field;
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;

  /**
   * A clear CMAF Header: one trak of AVC at a 90 kHz timescale, whose trex
   * declares track_ID 2 and no sample defaults.
   * @type {!Uint8Array}
   */
  let clearInit;

  /**
   * A protected CMAF Header: one trak at a 12288 timescale, whose trex
   * declares track_ID 1 and a 512-tick default duration, and whose tenc
   * declares an 8-byte per-sample IV.
   * @type {!Uint8Array}
   */
  let protectedInit;

  beforeAll(async () => {
    clearInit = BufferUtils.toUint8(
        await Util.fetch('/base/test/test/assets/cea-init.mp4'));
    protectedInit = BufferUtils.toUint8(await Util.fetch(
        '/base/test/test/assets/encrypted-sintel-video-init.mp4'));
  });

  /**
   * @param {!Object=} overrides
   * @return {msfCatalog.Track}
   */
  function makeTrack(overrides) {
    return /** @type {msfCatalog.Track} */ (Object.assign({
      name: 'video-1080p_locmaf',
      packaging: 'locmaf',
      locmafVersion: '0.3',
      isLive: true,
      codec: 'avc1.42E01E',
    }, overrides || {}));
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Uint8Array} initData
   * @return {{
   *   packaging: !shaka.extern.MsfPackaging,
   *   description: ?shaka.extern.MsfTrackDescription,
   * }}
   */
  function describe_(track, initData) {
    const packaging = shaka.msf.PackagingRegistry.create('locmaf');
    goog.asserts.assert(packaging, 'locmaf packaging must be registered');
    return {packaging, description: packaging.describeTrack(track, initData)};
  }

  /**
   * Encodes a QUIC variable-length integer (RFC 9000 section 16), which is the
   * vi64 every MOQT draft up to 16 uses.
   *
   * @param {number} value
   * @return {!Uint8Array}
   */
  function varint(value) {
    if (value < 64) {
      return new Uint8Array([value]);
    }
    if (value < 16384) {
      return new Uint8Array([0x40 | (value >> 8), value & 0xff]);
    }
    return new Uint8Array([
      0x80 | (value >>> 24), (value >>> 16) & 0xff,
      (value >>> 8) & 0xff, value & 0xff,
    ]);
  }

  /**
   * Builds a full-header LOCMAF object payload. Fields are emitted in
   * ascending ID order, and every value here is small enough to be an
   * unsigned vi64 or a byte string.
   *
   * @param {!Object<number, (number|!Array<number>|!Uint8Array)>} fields
   * @param {number} payloadLength
   * @return {!Uint8Array}
   */
  function fullObject(fields, payloadLength) {
    const ids = Object.keys(fields).map(Number).sort((a, b) => a - b);
    /** @type {!Array<!Uint8Array>} */
    const tuples = [];
    for (const id of ids) {
      const value = fields[id];
      if (id % 2 === 0) {
        tuples.push(varint(id), varint(/** @type {number} */ (value)));
      } else {
        const bytes = ArrayBuffer.isView(value) ?
            /** @type {!Uint8Array} */ (value) :
            shaka.util.Uint8ArrayUtils.concat(
                ...(/** @type {!Array<number>} */ (value)).map(varint));
        tuples.push(varint(id), varint(bytes.byteLength), bytes);
      }
    }

    const block = shaka.util.Uint8ArrayUtils.concat(...tuples);
    return shaka.util.Uint8ArrayUtils.concat(
        varint(2), varint(block.byteLength), block,
        new Uint8Array(payloadLength));
  }

  /**
   * @param {!Uint8Array} data
   * @return {!shaka.extern.MsfObject}
   */
  function object(data) {
    return {
      trackAlias: BigInt(1),
      location: {
        group: BigInt(0),
        object: BigInt(0),
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
   * @param {!Uint8Array} data
   * @return {!{order: !Array<string>, boxes: !Map<string, !Uint8Array>}}
   */
  function walk(data) {
    /** @type {!Array<string>} */
    const order = [];
    /** @type {!Map<string, !Uint8Array>} */
    const boxes = new Map();
    const view = BufferUtils.toDataView(data);
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
    return BufferUtils.toDataView(bytes).getUint32(offset);
  }

  describe('describeTrack', () => {
    it('describes the track the way a cmaf track is described', () => {
      const {description} = describe_(makeTrack(), clearInit);
      expect(description).not.toBe(null);
      expect(description.basicInfo.codecs).toBe('avc1.64001E');
      expect(description.basicInfo.timescale).toBe(90000);

      // A LOCMAF object is not self-describing, so unlike a LOC track this
      // one does carry an initialization segment -- the same one a cmaf
      // track of the same source would.
      const reference = description.initSegmentReference;
      expect(reference).not.toBe(null);
      expect(reference.timescale).toBe(90000);
      goog.asserts.assert(reference.segmentData, 'Null segmentData!');
      expect(BufferUtils.toUint8(reference.segmentData)).toEqual(clearInit);
    });

    it('skips a track whose locmafVersion is unsupported', () => {
      // The wire bytes give no way to detect a version change that
      // reinterprets them, so the track is left to its cmaf twin.
      const {description} =
          describe_(makeTrack({locmafVersion: '0.2'}), clearInit);
      expect(description).toBe(null);
    });

    it('skips a track with no locmafVersion at all', () => {
      const track = makeTrack();
      delete track['locmafVersion'];
      expect(describe_(track, clearInit).description).toBe(null);
    });

    it('skips a track with no initialization data', () => {
      // Every omitted field falls back to a trex default, so there is nothing
      // to reconstruct against.
      const {description} = describe_(makeTrack(), new Uint8Array(0));
      expect(description).toBe(null);
    });
  });

  describe('the segmenter', () => {
    it('reconstructs a chunk using the trex track ID', () => {
      const {packaging, description} = describe_(makeTrack(), clearInit);
      expect(description).not.toBe(null);

      const segments = packaging.createSegmenter().push(object(fullObject({
        [Field.TFHD_DEFAULT_SAMPLE_DURATION]: 3000,
        [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 90000,
        [Field.TRUN_SAMPLE_COUNT]: 1,
      }, /* payloadLength= */ 5)));

      expect(segments.length).toBe(1);
      const segment = segments[0];
      expect(segment.startTime).toBe(1);
      expect(segment.duration).toBeCloseTo(1 / 30, 6);
      // A CMAF chunk carries its own timing and cannot be discontinuous.
      expect(segment.timestampOffset).toBe(0);
      expect(segment.discontinuitySequence).toBe(-1);

      const {boxes} = walk(segment.data);
      // The track ID comes from the CMAF Header's trex, not the wire.
      expect(uint32(boxes.get('tfhd'), 4)).toBe(2);
      expect(uint32(boxes.get('tfhd'), 8)).toBe(3000);
      expect(boxes.get('mdat').byteLength).toBe(5);
    });

    it('falls back to the trex sample duration', () => {
      // The protected fixture's trex declares 512 ticks, so a chunk that
      // omits every duration field still has one.
      const {packaging, description} =
          describe_(makeTrack(), protectedInit);
      expect(description).not.toBe(null);

      const segments = packaging.createSegmenter().push(object(fullObject({
        [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array(
            [1, 2, 3, 4, 5, 6, 7, 8]),
        [Field.SENC_SUBSAMPLE_COUNT]: [1],
        [Field.SENC_BYTES_OF_CLEAR_DATA]: [16],
        [Field.SENC_BYTES_OF_PROTECTED_DATA]: [100],
        [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
        [Field.TRUN_SAMPLE_COUNT]: 1,
      }, /* payloadLength= */ 116)));

      expect(segments.length).toBe(1);
      expect(segments[0].duration).toBeCloseTo(512 / 12288, 6);
    });

    it('reconstructs the CENC boxes of a protected track', () => {
      const {packaging} = describe_(makeTrack(), protectedInit);
      const segments = packaging.createSegmenter().push(object(fullObject({
        [Field.SENC_INITIALIZATION_VECTOR]: new Uint8Array(
            [1, 2, 3, 4, 5, 6, 7, 8]),
        [Field.SENC_SUBSAMPLE_COUNT]: [1],
        [Field.SENC_BYTES_OF_CLEAR_DATA]: [16],
        [Field.SENC_BYTES_OF_PROTECTED_DATA]: [100],
        [Field.TFDT_BASE_MEDIA_DECODE_TIME]: 0,
        [Field.TRUN_SAMPLE_COUNT]: 1,
      }, /* payloadLength= */ 116)));

      const {order, boxes} = walk(segments[0].data);
      expect(order).toEqual(['moof', 'mfhd', 'traf', 'tfhd', 'tfdt', 'trun',
        'saiz', 'saio', 'senc', 'mdat']);

      // The IV size came from the CMAF Header's tenc, not from the object.
      const senc = boxes.get('senc');
      expect(uint32(senc, 4)).toBe(1);
      expect(Array.from(senc.subarray(8, 16))).toEqual([1, 2, 3, 4, 5, 6,
        7, 8]);
      expect(boxes.get('saiz')[4]).toBe(16);
      expect(uint32(boxes.get('saio'), 8)).toBe(145);
    });

    it('produces no segment from a status object', () => {
      const {packaging} = describe_(makeTrack(), clearInit);
      expect(packaging.createSegmenter().push(object(new Uint8Array(0))))
          .toEqual([]);
    });
  });
});
