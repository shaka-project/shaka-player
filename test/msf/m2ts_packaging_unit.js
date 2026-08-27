/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.M2ts', isMSFSupported, () => {
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const TS_PACKET_SIZE = 188;
  const M2TS_PACKET_SIZE = 192;

  /**
   * A real transport stream: 334 packets carrying a PAT, a PMT and one AVC
   * elementary stream.
   * @type {!Uint8Array}
   */
  let transportStream;

  beforeAll(async () => {
    const response = await Util.fetch('/base/test/test/assets/video.ts');
    transportStream = BufferUtils.toUint8(response);
  });

  /**
   * @param {!Object=} overrides
   * @return {msfCatalog.Track}
   */
  function makeTrack(overrides) {
    return /** @type {msfCatalog.Track} */ (Object.assign({
      name: 'program-1-ts',
      packaging: 'm2ts',
      isLive: true,
      mimeType: 'video/mp2t',
      codec: 'avc1.42E01E',
      m2tsPacketSize: TS_PACKET_SIZE,
    }, overrides || {}));
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Uint8Array=} initData
   * @return {{
   *   packaging: !shaka.extern.MsfPackaging,
   *   description: !shaka.extern.MsfTrackDescription,
   * }}
   */
  function describe_(track, initData) {
    const packaging = shaka.msf.PackagingRegistry.create('m2ts');
    goog.asserts.assert(packaging, 'm2ts packaging must be registered');
    const description =
        packaging.describeTrack(track, initData || new Uint8Array(0));
    goog.asserts.assert(description, 'track must be described');
    return {packaging, description};
  }

  /**
   * Splits a transport stream into the payloads of successive MoQT objects.
   *
   * @param {!Uint8Array} data
   * @param {number} packetsPerObject
   * @param {number=} packetSize
   * @return {!Array<!Uint8Array>}
   */
  function splitIntoObjects(data, packetsPerObject, packetSize) {
    const size = packetsPerObject * (packetSize || TS_PACKET_SIZE);
    const objects = [];
    for (let i = 0; i < data.byteLength; i += size) {
      objects.push(data.subarray(i, Math.min(i + size, data.byteLength)));
    }
    return objects;
  }

  /**
   * @param {number} group
   * @param {number} objectId
   * @param {!Uint8Array} data
   * @return {!shaka.msf.Utils.MOQObject}
   */
  function makeObject(group, objectId, data) {
    return /** @type {!shaka.msf.Utils.MOQObject} */ ({
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
    });
  }

  /**
   * Feeds every object of one group and returns whatever segments that
   * completed.  A group's own segment only comes out once the next group
   * starts, so this returns the *previous* group's segment.
   *
   * @param {!shaka.extern.MsfSegmenter} segmenter
   * @param {number} group
   * @param {!Array<!Uint8Array>} objects
   * @return {!Array<!shaka.extern.MsfSegment>}
   */
  function pushGroup(segmenter, group, objects) {
    const segments = [];
    for (let i = 0; i < objects.length; i++) {
      segments.push(...segmenter.push(makeObject(group, i, objects[i])));
    }
    return segments;
  }

  /**
   * Rewrites a copy of a transport stream so that the first packet carrying an
   * adaptation field signals a discontinuity.
   *
   * @param {!Uint8Array} data
   * @return {{data: !Uint8Array, pid: number}}
   */
  function flagDiscontinuity(data) {
    const copy = data.slice();
    for (let i = 0; i < copy.byteLength; i += TS_PACKET_SIZE) {
      const adaptationFieldControl = (copy[i + 3] & 0x30) >> 4;
      if (adaptationFieldControl > 1 && copy[i + 4] > 0) {
        copy[i + 5] |= 0x80;
        return {
          data: copy,
          pid: ((copy[i + 1] & 0x1f) << 8) | copy[i + 2],
        };
      }
    }
    throw new Error('fixture has no adaptation field to flag');
  }

  /**
   * Wraps each transport packet in a 192-octet M2TS source packet.  The
   * 4-octet arrival timestamp is left as zeroes, which also means a
   * mis-computed offset would fail the sync byte check.
   *
   * @param {!Uint8Array} data
   * @return {!Uint8Array}
   */
  function toM2ts(data) {
    const count = data.byteLength / TS_PACKET_SIZE;
    const out = new Uint8Array(count * M2TS_PACKET_SIZE);
    for (let i = 0; i < count; i++) {
      out.set(
          data.subarray(i * TS_PACKET_SIZE, (i + 1) * TS_PACKET_SIZE),
          i * M2TS_PACKET_SIZE + 4);
    }
    return out;
  }

  describe('describeTrack', () => {
    it('presents the track as a transport stream', () => {
      const {description} = describe_(makeTrack());

      expect(description.basicInfo.mimeType).toBe('video/mp2t');
      expect(description.basicInfo.codecs).toBe('avc1.42E01E');
      // A transport stream has no initialization segment; the PAT/PMT rides
      // in the group payload instead.
      expect(description.initSegmentReference).toBeNull();
    });

    it('keeps both codecs of a muxed program on one stream', () => {
      const {description} = describe_(makeTrack({
        codec: 'avc1.64001f, mp4a.40.2',
      }));

      // MediaSourceEngine reads both off the one stream and opens a source
      // buffer for each.
      expect(description.basicInfo.codecs).toBe('avc1.64001f,mp4a.40.2');
    });

    it('accepts 192-octet source packets', () => {
      const {description} = describe_(makeTrack({
        m2tsPacketSize: M2TS_PACKET_SIZE,
      }));

      expect(description.basicInfo.mimeType).toBe('video/mp2t');
    });

    it('rejects a track with no codec', () => {
      const packaging = shaka.msf.PackagingRegistry.create('m2ts');
      goog.asserts.assert(packaging, 'm2ts packaging must be registered');

      const track = makeTrack();
      delete track['codec'];

      expect(packaging.describeTrack(track, new Uint8Array(0))).toBeNull();
    });

    it('rejects an unsupported source packet size', () => {
      const packaging = shaka.msf.PackagingRegistry.create('m2ts');
      goog.asserts.assert(packaging, 'm2ts packaging must be registered');

      const track = makeTrack({m2tsPacketSize: 204});

      expect(packaging.describeTrack(track, new Uint8Array(0))).toBeNull();
    });

    it('rejects a track whose codec is not recognized', () => {
      const packaging = shaka.msf.PackagingRegistry.create('m2ts');
      goog.asserts.assert(packaging, 'm2ts packaging must be registered');

      const track = makeTrack({codec: 'not-a-codec'});

      expect(packaging.describeTrack(track, new Uint8Array(0))).toBeNull();
    });
  });

  describe('segmenter', () => {
    it('emits nothing until a group ends', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      expect(objects.length).toBeGreaterThan(1);

      expect(pushGroup(segmenter, 0, objects)).toEqual([]);
    });

    it('emits one segment carrying the whole group', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments.length).toBe(1);
      expect(segments[0].data.byteLength).toBe(transportStream.byteLength);
      expect(segments[0].data).toEqual(transportStream);
    });

    it('times the group from its own elementary stream', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      const expectedStart = new shaka.util.TsParser()
          .parse(transportStream)
          .getStartTime(ContentType.VIDEO);
      goog.asserts.assert(expectedStart != null, 'fixture must have a PTS');
      expect(segments[0].startTime).toBeCloseTo(expectedStart, 6);
      expect(segments[0].duration).toBeGreaterThan(0);
    });

    it('does not shift a continuous stream', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments[0].timestampOffset).toBe(0);
      expect(segments[0].discontinuitySequence).toBe(0);
    });

    it('prepends the initialization packets to every group', () => {
      const psi = transportStream.subarray(0, 2 * TS_PACKET_SIZE);
      const {packaging} = describe_(makeTrack(), psi);
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments[0].data.byteLength)
          .toBe(psi.byteLength + transportStream.byteLength);
      expect(segments[0].data.subarray(0, psi.byteLength)).toEqual(psi);
    });

    // The first object carries the PAT and PMT, so these corrupt a later one:
    // a group that loses its program information cannot be interpreted at all,
    // which the "no usable timestamps" case below covers.
    it('drops an object that is not whole source packets', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const truncated = objects.slice();
      truncated[1] = truncated[1].subarray(0, truncated[1].byteLength - 3);

      pushGroup(segmenter, 0, truncated);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments.length).toBe(1);
      // The bad object contributed nothing; the rest of the group survived.
      expect(segments[0].data.byteLength)
          .toBe(transportStream.byteLength - objects[1].byteLength);
    });

    it('drops an object with no sync byte', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const corrupted = objects.slice();
      const copy = corrupted[1].slice();
      copy[0] = 0x00;
      corrupted[1] = copy;

      pushGroup(segmenter, 0, corrupted);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments.length).toBe(1);
      expect(segments[0].data.byteLength)
          .toBe(transportStream.byteLength - objects[1].byteLength);
    });

    it('drops a group that carries no program information', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      // Without the PAT/PMT the transport packets cannot be assigned to an
      // elementary stream, so nothing can be timed.  Declaring initData in the
      // catalog is what protects a stream whose program information does not
      // repeat at every group.
      pushGroup(segmenter, 0, objects.slice(1));
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments).toEqual([]);
    });
  });

  describe('192-octet source packets', () => {
    it('yields the same transport packets as the 188-octet form', () => {
      const plain = describe_(makeTrack());
      const plainSegmenter = plain.packaging.createSegmenter();
      const plainObjects = splitIntoObjects(transportStream, 64);
      pushGroup(plainSegmenter, 0, plainObjects);
      const plainSegments = pushGroup(plainSegmenter, 1, plainObjects);

      const wrapped = describe_(makeTrack({
        m2tsPacketSize: M2TS_PACKET_SIZE,
      }));
      const wrappedSegmenter = wrapped.packaging.createSegmenter();
      const wrappedObjects =
          splitIntoObjects(toM2ts(transportStream), 64, M2TS_PACKET_SIZE);
      pushGroup(wrappedSegmenter, 0, wrappedObjects);
      const wrappedSegments = pushGroup(wrappedSegmenter, 1, wrappedObjects);

      expect(wrappedSegments.length).toBe(1);
      // The arrival timestamps are gone and the rest is byte for byte the
      // stream the plain path produced, so everything downstream is unaware
      // that the publisher sent M2TS.
      expect(wrappedSegments[0].data).toEqual(plainSegments[0].data);
      expect(wrappedSegments[0].startTime)
          .toBeCloseTo(plainSegments[0].startTime, 6);
      expect(wrappedSegments[0].duration)
          .toBeCloseTo(plainSegments[0].duration, 6);
    });

    it('strips the timestamp prefix from the initialization packets', () => {
      const psi = transportStream.subarray(0, 2 * TS_PACKET_SIZE);
      const {packaging} = describe_(
          makeTrack({m2tsPacketSize: M2TS_PACKET_SIZE}), toM2ts(psi));
      const segmenter = packaging.createSegmenter();

      const objects =
          splitIntoObjects(toM2ts(transportStream), 64, M2TS_PACKET_SIZE);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments[0].data.subarray(0, psi.byteLength)).toEqual(psi);
    });
  });

  describe('PCR discontinuity', () => {
    it('increments the discontinuity sequence', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged =
          splitIntoObjects(flagDiscontinuity(transportStream).data, 64);

      pushGroup(segmenter, 0, objects);
      const first = pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      expect(first[0].discontinuitySequence).toBe(0);
      expect(second[0].discontinuitySequence).toBe(1);
    });

    it('keeps presentation time moving forward across a clock reset', () => {
      const {packaging} = describe_(makeTrack());
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged =
          splitIntoObjects(flagDiscontinuity(transportStream).data, 64);

      pushGroup(segmenter, 0, objects);
      const first = pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      // The second group replays the same media timestamps, which is the
      // worst case: without re-anchoring it would land back on top of the
      // first group.
      const firstEnd = first[0].startTime + first[0].duration;
      expect(second[0].startTime).toBeCloseTo(firstEnd, 6);
      expect(second[0].duration).toBeCloseTo(first[0].duration, 6);
      // The media has to be shifted by the same amount at append time, or the
      // buffered media would not land where the segment says it does.
      expect(second[0].timestampOffset)
          .toBeCloseTo(firstEnd - first[0].startTime, 6);
    });

    it('ignores the indicator on a PID that is not the PCR PID', () => {
      const flaggedStream = flagDiscontinuity(transportStream);
      const {packaging} = describe_(makeTrack({
        m2tsPcrPid: flaggedStream.pid + 1,
      }));
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged = splitIntoObjects(flaggedStream.data, 64);

      pushGroup(segmenter, 0, objects);
      pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      expect(second[0].discontinuitySequence).toBe(0);
      expect(second[0].timestampOffset).toBe(0);
    });

    it('honours the indicator on the PCR PID', () => {
      const flaggedStream = flagDiscontinuity(transportStream);
      const {packaging} = describe_(makeTrack({
        m2tsPcrPid: flaggedStream.pid,
      }));
      const segmenter = packaging.createSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged = splitIntoObjects(flaggedStream.data, 64);

      pushGroup(segmenter, 0, objects);
      pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      expect(second[0].discontinuitySequence).toBe(1);
    });
  });
});
