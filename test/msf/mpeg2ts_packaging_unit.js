/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.Mpeg2ts', isMSFSupported, () => {
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const TS_PACKET_SIZE = 188;
  const M2TS_PACKET_SIZE = 192;

  // The fixture's layout: a PAT, a PMT on PID 32 for program 1, and an AVC
  // elementary stream on PID 80, which also carries the PCR. Its only IDR
  // starts at packet 2 and its last PES packet at packet 332.
  const PMT_PID = 32;
  const VIDEO_PID = 80;
  const FIRST_PES_PACKET = 2;
  const LAST_PES_PACKET = 332;

  /**
   * A real transport stream: 334 packets carrying a PAT, a PMT and one AVC
   * elementary stream.
   * @type {!Uint8Array}
   */
  let transportStream;

  /** @type {!Uint8Array} */
  let psi;

  /** @type {number} */
  let mediaStartTime;

  beforeAll(async () => {
    const response = await Util.fetch('/base/test/test/assets/video.ts');
    transportStream = BufferUtils.toUint8(response);
    psi = transportStream.subarray(0, 2 * TS_PACKET_SIZE);
    const start = new shaka.util.TsParser()
        .parse(transportStream)
        .getStartTime(ContentType.VIDEO);
    goog.asserts.assert(start != null, 'fixture must have a PTS');
    mediaStartTime = start;
  });

  /**
   * @param {!Object=} overrides
   * @return {msfCatalog.Track}
   */
  function makeTrack(overrides) {
    return /** @type {msfCatalog.Track} */ (Object.assign({
      name: 'program-1-ts',
      packaging: 'mpeg2ts',
      mpeg2tsMode: 'unmodified-program',
      isLive: true,
      mimeType: 'video/mp2t',
      codec: 'avc1.42E01E',
      mpeg2tsPacketSize: TS_PACKET_SIZE,
      mpeg2tsRandomAccess: true,
    }, overrides || {}));
  }

  /**
   * @param {msfCatalog.Track} track
   * @param {!Uint8Array=} initData
   * @return {?shaka.extern.MsfTrackDescription}
   */
  function tryDescribe(track, initData) {
    const packaging = shaka.msf.PackagingRegistry.create('mpeg2ts');
    goog.asserts.assert(packaging, 'mpeg2ts packaging must be registered');
    return packaging.describeTrack(track, initData || new Uint8Array(0));
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
    const packaging = shaka.msf.PackagingRegistry.create('mpeg2ts');
    goog.asserts.assert(packaging, 'mpeg2ts packaging must be registered');
    const description =
        packaging.describeTrack(track, initData || new Uint8Array(0));
    goog.asserts.assert(description, 'track must be described');
    return {packaging, description};
  }

  /**
   * @param {!Object=} overrides
   * @param {!Uint8Array=} initData
   * @return {!shaka.extern.MsfSegmenter}
   */
  function makeSegmenter(overrides, initData) {
    return describe_(makeTrack(overrides), initData)
        .packaging.createSegmenter();
  }

  /**
   * @param {!Uint8Array} data
   * @param {number} index
   * @return {!Uint8Array}
   */
  function packetAt(data, index) {
    return data.subarray(index * TS_PACKET_SIZE, (index + 1) * TS_PACKET_SIZE);
  }

  /**
   * @param {!Uint8Array} data
   * @return {!Array<!Uint8Array>}
   */
  function packetsOf(data) {
    const packets = [];
    for (let i = 0; i < data.byteLength / TS_PACKET_SIZE; i++) {
      packets.push(packetAt(data, i));
    }
    return packets;
  }

  /**
   * @param {!Array<!Uint8Array>} parts
   * @return {!Uint8Array}
   */
  function concat(parts) {
    return shaka.util.Uint8ArrayUtils.concat(...parts);
  }

  /**
   * @param {!Uint8Array} packet
   * @return {number}
   */
  function pidOf(packet) {
    return ((packet[1] & 0x1f) << 8) | packet[2];
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
   * Feeds a whole stream as group 0 and returns its segment, which group 1
   * starting completes.
   *
   * @param {!shaka.extern.MsfSegmenter} segmenter
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MsfSegment>}
   */
  function segmentsOf(segmenter, data) {
    const segments = pushGroup(segmenter, 0, splitIntoObjects(data, 64));
    segments.push(...pushGroup(segmenter, 1, [psi]));
    return segments;
  }

  /**
   * Rewrites a copy of a transport stream so that the given packet, which has
   * an adaptation field, signals a discontinuity.
   *
   * @param {!Uint8Array} data
   * @param {number} index
   * @return {!Uint8Array}
   */
  function flagDiscontinuity(data, index) {
    const copy = data.slice();
    const offset = index * TS_PACKET_SIZE;
    const adaptationFieldControl = (copy[offset + 3] & 0x30) >> 4;
    goog.asserts.assert(adaptationFieldControl > 1 && copy[offset + 4] > 0,
        'packet must have an adaptation field to flag');
    copy[offset + 5] |= 0x80;
    return copy;
  }

  /**
   * The index of the first packet at or after the given one that carries a
   * PCR on the video PID.
   *
   * @param {number} from
   * @return {number}
   */
  function pcrPacketFrom(from) {
    for (let i = from; i < transportStream.byteLength / TS_PACKET_SIZE; i++) {
      const packet = packetAt(transportStream, i);
      if (pidOf(packet) == VIDEO_PID && ((packet[3] & 0x30) >> 4) > 1 &&
          packet[4] > 0 && (packet[5] & 0x10)) {
        return i;
      }
    }
    throw new Error('fixture has no PCR after packet ' + from);
  }

  /**
   * Wraps each transport packet in a 192-octet M2TS source packet.  The
   * 4-octet prefix is left as zeroes, which also means a mis-computed offset
   * would fail the sync byte check.
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

  /**
   * Builds a one-packet PSI section on a PID.
   *
   * @param {number} pid
   * @param {!Array<number>} sectionWithoutCrc
   * @return {!Uint8Array}
   */
  function makeSectionPacket(pid, sectionWithoutCrc) {
    const section = new Uint8Array(sectionWithoutCrc.length + 4);
    section.set(sectionWithoutCrc);
    const crc = shaka.util.TsParser.crc32(section.subarray(0, -4));
    section.set([crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff,
      crc & 0xff], section.byteLength - 4);

    const packet = new Uint8Array(TS_PACKET_SIZE).fill(0xff);
    packet.set([0x47, 0x40 | (pid >> 8), pid & 0xff, 0x10, 0x00]);
    packet.set(section, 5);
    return packet;
  }

  /**
   * @param {!Array<{program: number, pid: number}>} programs
   * @return {!Uint8Array}
   */
  function makePat(programs) {
    const length = 5 + 4 * programs.length + 4;
    const section = [0x00, 0xb0, length, 0x00, 0x01, 0xc1, 0x00, 0x00];
    for (const {program, pid} of programs) {
      section.push(program >> 8, program & 0xff, 0xe0 | (pid >> 8), pid & 0xff);
    }
    return makeSectionPacket(0, section);
  }

  /**
   * @param {number} pmtPid
   * @param {number} program
   * @param {number} pcrPid
   * @param {!Array<{type: number, pid: number}>} streams
   * @return {!Uint8Array}
   */
  function makePmt(pmtPid, program, pcrPid, streams) {
    const length = 9 + 5 * streams.length + 4;
    const section = [
      0x02, 0xb0, length, program >> 8, program & 0xff, 0xc1, 0x00, 0x00,
      0xe0 | (pcrPid >> 8), pcrPid & 0xff, 0xf0, 0x00,
    ];
    for (const {type, pid} of streams) {
      section.push(type, 0xe0 | (pid >> 8), pid & 0xff, 0xf0, 0x00);
    }
    return makeSectionPacket(pmtPid, section);
  }

  /**
   * @param {!Uint8Array} packet
   * @param {number} pid
   * @return {!Uint8Array}
   */
  function withPid(packet, pid) {
    const copy = packet.slice();
    copy[1] = (copy[1] & 0xe0) | (pid >> 8);
    copy[2] = pid & 0xff;
    return copy;
  }

  /**
   * Reads the program entries of the PAT a packet carries.
   *
   * @param {!Uint8Array} packet
   * @return {!Array<{program: number, pid: number}>}
   */
  function readPat(packet) {
    const offset = 5 + packet[4];
    const section = packet.subarray(
        offset, offset + 3 + (((packet[offset + 1] & 0x0f) << 8) |
        packet[offset + 2]));
    expect(shaka.util.TsParser.crc32(section)).toBe(0);
    const programs = [];
    for (let i = 8; i + 4 <= section.byteLength - 4; i += 4) {
      programs.push({
        program: (section[i] << 8) | section[i + 1],
        pid: ((section[i + 2] & 0x1f) << 8) | section[i + 3],
      });
    }
    return programs;
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

    it('accepts the per-program mode', () => {
      expect(tryDescribe(makeTrack({mpeg2tsMode: 'per-program'})))
          .not.toBeNull();
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
        mpeg2tsPacketSize: M2TS_PACKET_SIZE,
      }));

      expect(description.basicInfo.mimeType).toBe('video/mp2t');
    });

    it('reads the codec from the PMT when the catalog has none', () => {
      const track = makeTrack();
      delete track['codec'];

      const {description} = describe_(track, psi);

      expect(description.basicInfo.codecs).toBe('avc1.42E01E');
    });

    it('reads the codec of the reference program of a multiplex', () => {
      const multiplexPsi = concat([
        makePat([{program: 1, pid: 0x40}, {program: 2, pid: 0x41}]),
        makePmt(0x40, 1, 0x100, [{type: 0x1b, pid: 0x100}]),
        makePmt(0x41, 2, 0x200, [{type: 0x0f, pid: 0x200}]),
      ]);
      const track = makeTrack({
        mpeg2tsMode: 'unmodified-multiplex',
        mpeg2tsProgramNumber: 2,
      });
      delete track['codec'];

      const {description} = describe_(track, multiplexPsi);

      expect(description.basicInfo.codecs).toBe('mp4a.40.2');
    });

    it('rejects a track with no codec and no PMT', () => {
      const track = makeTrack();
      delete track['codec'];

      expect(tryDescribe(track)).toBeNull();
    });

    it('rejects a track with no mode', () => {
      const track = makeTrack();
      delete track['mpeg2tsMode'];

      expect(tryDescribe(track)).toBeNull();
    });

    it('rejects an unknown mode', () => {
      expect(tryDescribe(makeTrack({mpeg2tsMode: 'whole-thing'}))).toBeNull();
    });

    it('rejects the es-packets mode', () => {
      expect(tryDescribe(makeTrack({
        mpeg2tsMode: 'es-packets',
        mpeg2tsEsPid: VIDEO_PID,
      }))).toBeNull();
    });

    it('rejects an ES PID outside the es-packets mode', () => {
      expect(tryDescribe(makeTrack({mpeg2tsEsPid: VIDEO_PID}))).toBeNull();
    });

    it('rejects an unsupported source packet size', () => {
      expect(tryDescribe(makeTrack({mpeg2tsPacketSize: 204}))).toBeNull();
    });

    it('rejects out of range PIDs and program numbers', () => {
      expect(tryDescribe(makeTrack({mpeg2tsProgramNumber: 0}))).toBeNull();
      expect(tryDescribe(makeTrack({mpeg2tsProgramNumber: 1.5}))).toBeNull();
      expect(tryDescribe(makeTrack({mpeg2tsPcrPid: 0x2000}))).toBeNull();
    });

    it('rejects a multiplex without a reference program', () => {
      expect(tryDescribe(makeTrack({mpeg2tsMode: 'unmodified-multiplex'})))
          .toBeNull();
    });

    it('rejects a multiplex in an altGroup', () => {
      expect(tryDescribe(makeTrack({
        mpeg2tsMode: 'unmodified-multiplex',
        mpeg2tsProgramNumber: 1,
        altGroup: 1,
      }))).toBeNull();
    });

    it('accepts a multiplex with a reference program', () => {
      expect(tryDescribe(makeTrack({
        mpeg2tsMode: 'unmodified-multiplex',
        mpeg2tsProgramNumber: 1,
      }))).not.toBeNull();
    });

    it('rejects a track whose codec is not recognized', () => {
      expect(tryDescribe(makeTrack({codec: 'not-a-codec'}))).toBeNull();
    });

    it('ignores initialization data that is not whole packets', () => {
      const segmenter =
          makeSegmenter({}, psi.subarray(0, psi.byteLength - 1));

      // A group that opens without its program information gets nothing put
      // in front of it, so it cannot be timed.
      const withoutPsi = transportStream.subarray(psi.byteLength);
      expect(segmentsOf(segmenter, withoutPsi)).toEqual([]);
    });
  });

  describe('segmenter', () => {
    it('emits nothing until a group ends', () => {
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      expect(objects.length).toBeGreaterThan(1);

      expect(pushGroup(segmenter, 0, objects)).toEqual([]);
    });

    it('emits one segment carrying the whole group', () => {
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments.length).toBe(1);
      // The group opens with its own PAT and PMT, so nothing is added.
      expect(segments[0].data).toEqual(transportStream);
      expect(segments[0].group).toBe(BigInt(0));
    });

    it('times the group from its own elementary stream', () => {
      const segments = segmentsOf(makeSegmenter(), transportStream);

      expect(segments[0].startTime).toBeCloseTo(mediaStartTime, 6);
      expect(segments[0].duration).toBeGreaterThan(0);
    });

    it('does not shift a continuous stream', () => {
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      pushGroup(segmenter, 0, objects);
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments[0].timestampOffset).toBe(0);
      expect(segments[0].discontinuitySequence).toBe(0);
    });

    it('prepends the catalog PSI to a group that opens without it', () => {
      const segmenter = makeSegmenter({}, psi);
      const withoutPsi = transportStream.subarray(psi.byteLength);

      const segments = segmentsOf(segmenter, withoutPsi);

      expect(segments.length).toBe(1);
      expect(segments[0].data).toEqual(transportStream);
    });

    it('prepends the latest PSI seen in the track', () => {
      // The catalog has none, and the second group opens without it: the
      // first group's is what makes it playable.
      const segmenter = makeSegmenter();
      const withoutPsi = transportStream.subarray(psi.byteLength);

      pushGroup(segmenter, 0, splitIntoObjects(transportStream, 64));
      pushGroup(segmenter, 1, splitIntoObjects(withoutPsi, 64));
      const segments = pushGroup(segmenter, 2, [psi]);

      expect(segments.length).toBe(1);
      expect(segments[0].data).toEqual(transportStream);
    });

    it('prefers the PSI in the track over the catalog PSI', () => {
      // The catalog says the program is on PMT PID 33, which the track
      // corrects.
      const stalePsi = concat([
        makePat([{program: 1, pid: 33}]),
        makePmt(33, 1, VIDEO_PID, [{type: 0x1b, pid: VIDEO_PID}]),
      ]);
      const segmenter = makeSegmenter({}, stalePsi);
      const withoutPsi = transportStream.subarray(psi.byteLength);

      pushGroup(segmenter, 0, splitIntoObjects(transportStream, 64));
      pushGroup(segmenter, 1, splitIntoObjects(withoutPsi, 64));
      const segments = pushGroup(segmenter, 2, [psi]);

      expect(segments[0].data.subarray(0, psi.byteLength)).toEqual(psi);
    });

    // The first object carries the PAT and PMT, so these corrupt a later one:
    // a group that loses its program information cannot be interpreted at all,
    // which the "no program information" case below covers.
    it('drops an object that is not whole source packets', () => {
      const segmenter = makeSegmenter();

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
      const segmenter = makeSegmenter();

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
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      // Without the PAT/PMT the transport packets cannot be assigned to an
      // elementary stream, so nothing can be timed.
      pushGroup(segmenter, 0, objects.slice(1));
      const segments = pushGroup(segmenter, 1, objects);

      expect(segments).toEqual([]);
    });

    it('fails on a stream scrambled at the transport level', () => {
      const segmenter = makeSegmenter();
      const scrambled = transportStream.slice();
      // transport_scrambling_control of the first video packet.
      scrambled[FIRST_PES_PACKET * TS_PACKET_SIZE + 3] |= 0x80;

      expect(() => pushGroup(segmenter, 0, [scrambled])).toThrow(
          Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER)));
    });
  });

  describe('192-octet source packets', () => {
    it('yields the same transport packets as the 188-octet form', () => {
      const plainSegments = segmentsOf(makeSegmenter(), transportStream);

      const wrappedSegmenter = makeSegmenter({
        mpeg2tsPacketSize: M2TS_PACKET_SIZE,
      });
      pushGroup(wrappedSegmenter, 0,
          splitIntoObjects(toM2ts(transportStream), 64, M2TS_PACKET_SIZE));
      const wrappedSegments =
          pushGroup(wrappedSegmenter, 1, [toM2ts(psi)]);

      expect(wrappedSegments.length).toBe(1);
      // The prefixes are gone and the rest is byte for byte the stream the
      // plain path produced, so everything downstream is unaware that the
      // publisher sent M2TS.
      expect(wrappedSegments[0].data).toEqual(plainSegments[0].data);
      expect(wrappedSegments[0].startTime)
          .toBeCloseTo(plainSegments[0].startTime, 6);
      expect(wrappedSegments[0].duration)
          .toBeCloseTo(plainSegments[0].duration, 6);
    });

    it('strips the prefix from the initialization packets', () => {
      const segmenter = makeSegmenter(
          {mpeg2tsPacketSize: M2TS_PACKET_SIZE}, toM2ts(psi));
      const withoutPsi = transportStream.subarray(psi.byteLength);

      pushGroup(segmenter, 0,
          splitIntoObjects(toM2ts(withoutPsi), 64, M2TS_PACKET_SIZE));
      const segments = pushGroup(segmenter, 1, [toM2ts(psi)]);

      expect(segments[0].data.subarray(0, psi.byteLength)).toEqual(psi);
    });
  });

  describe('PCR discontinuity', () => {
    it('increments the discontinuity sequence', () => {
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged = splitIntoObjects(
          flagDiscontinuity(transportStream, pcrPacketFrom(0)), 64);

      pushGroup(segmenter, 0, objects);
      const first = pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      expect(first[0].discontinuitySequence).toBe(0);
      expect(second[0].discontinuitySequence).toBe(1);
    });

    it('keeps presentation time moving forward across a clock reset', () => {
      const segmenter = makeSegmenter();

      const objects = splitIntoObjects(transportStream, 64);
      const flagged = splitIntoObjects(
          flagDiscontinuity(transportStream, pcrPacketFrom(0)), 64);

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
      const segmenter = makeSegmenter();

      // The PAT packet has an adaptation field, but the PMT names PID 80 as
      // the PCR PID.
      const objects = splitIntoObjects(transportStream, 64);
      const flagged =
          splitIntoObjects(flagDiscontinuity(transportStream, 0), 64);

      pushGroup(segmenter, 0, objects);
      pushGroup(segmenter, 1, flagged);
      const second = pushGroup(segmenter, 2, objects);

      expect(second[0].discontinuitySequence).toBe(0);
      expect(second[0].timestampOffset).toBe(0);
    });

    it('splits a group at a discontinuity in its middle', () => {
      const segmenter = makeSegmenter();
      const middle = pcrPacketFrom(150);
      const flagged = flagDiscontinuity(transportStream, middle);

      // The part before the discontinuity is complete as soon as it is seen.
      const first = pushGroup(segmenter, 0, splitIntoObjects(flagged, 64));
      expect(first.length).toBe(1);
      expect(first[0].data).toEqual(
          transportStream.subarray(0, middle * TS_PACKET_SIZE));
      expect(first[0].discontinuitySequence).toBe(0);

      const second = pushGroup(segmenter, 1, [psi]);
      expect(second.length).toBe(1);
      expect(second[0].discontinuitySequence).toBe(1);
      expect(second[0].group).toBe(BigInt(0));
      // The second part opens mid-stream, so it gets the PSI put back.
      expect(second[0].data).toEqual(concat([
        psi,
        flagged.subarray(middle * TS_PACKET_SIZE),
      ]));
      expect(second[0].startTime)
          .toBeCloseTo(first[0].startTime + first[0].duration, 6);
    });
  });

  describe('random access', () => {
    /**
     * The fixture with its last, non-IDR, PES packet moved in front of the
     * IDR.
     * @return {!Uint8Array}
     */
    function openingMidGop() {
      return concat([
        psi,
        transportStream.subarray(LAST_PES_PACKET * TS_PACKET_SIZE),
        transportStream.subarray(
            FIRST_PES_PACKET * TS_PACKET_SIZE,
            LAST_PES_PACKET * TS_PACKET_SIZE),
      ]);
    }

    it('starts the first group at its first IDR', () => {
      const segmenter = makeSegmenter({mpeg2tsRandomAccess: undefined});

      const segments = segmentsOf(segmenter, openingMidGop());

      expect(segments.length).toBe(1);
      expect(segments[0].data).toEqual(
          transportStream.subarray(0, LAST_PES_PACKET * TS_PACKET_SIZE));
    });

    it('drops groups until one has a random access point', () => {
      const segmenter = makeSegmenter({mpeg2tsRandomAccess: false});
      const noIdr = concat([
        psi,
        transportStream.subarray(pcrPacketFrom(FIRST_PES_PACKET + 1) *
            TS_PACKET_SIZE),
      ]);

      expect(pushGroup(segmenter, 0, [noIdr])).toEqual([]);
      expect(pushGroup(segmenter, 1, [transportStream])).toEqual([]);
      const segments = pushGroup(segmenter, 2, [noIdr]);

      expect(segments.length).toBe(1);
      expect(segments[0].group).toBe(BigInt(1));
      expect(segments[0].data).toEqual(transportStream);
    });

    it('only trims the first group', () => {
      const segmenter = makeSegmenter({mpeg2tsRandomAccess: false});

      pushGroup(segmenter, 0, [transportStream]);
      const segments = pushGroup(segmenter, 1, [openingMidGop()]);
      segments.push(...pushGroup(segmenter, 2, [psi]));

      expect(segments.length).toBe(2);
      expect(segments[1].data).toEqual(openingMidGop());
    });

    it('trusts the catalog when it guarantees random access', () => {
      const segments = segmentsOf(makeSegmenter(), openingMidGop());

      expect(segments[0].data).toEqual(openingMidGop());
    });

    it('honours random_access_indicator', () => {
      const segmenter = makeSegmenter({mpeg2tsRandomAccess: false});
      // Flag the opening non-IDR PES as a random access point.
      const data = openingMidGop();
      const first = 2 * TS_PACKET_SIZE;
      goog.asserts.assert(((data[first + 3] & 0x30) >> 4) > 1 &&
          data[first + 4] > 0, 'packet must have an adaptation field');
      data[first + 5] |= 0x40;

      const segments = segmentsOf(segmenter, data);

      expect(segments[0].data).toEqual(data);
    });
  });

  describe('unmodified-multiplex', () => {
    const OTHER_PMT_PID = 0x40;
    const OTHER_VIDEO_PID = 0x60;

    /**
     * The fixture with a second program next to it: program 2, a copy of
     * program 1 on other PIDs, and a PAT that lists the network information
     * table first, as DVB multiplexes do.
     * @return {!Uint8Array}
     */
    function makeMultiplex() {
      const pat = makePat([
        {program: 0, pid: 0x10},
        {program: 1, pid: PMT_PID},
        {program: 2, pid: OTHER_PMT_PID},
      ]);
      const otherPmt = makePmt(OTHER_PMT_PID, 2, OTHER_VIDEO_PID,
          [{type: 0x1b, pid: OTHER_VIDEO_PID}]);
      const out = [];
      for (const packet of packetsOf(transportStream)) {
        const pid = pidOf(packet);
        if (pid == 0) {
          out.push(pat);
        } else if (pid == PMT_PID) {
          out.push(packet, otherPmt);
        } else {
          out.push(packet, withPid(packet, OTHER_VIDEO_PID));
        }
      }
      return concat(out);
    }

    /**
     * @param {number} program
     * @return {!shaka.extern.MsfSegment}
     */
    function segmentOfProgram(program) {
      const segmenter = makeSegmenter({
        mpeg2tsMode: 'unmodified-multiplex',
        mpeg2tsProgramNumber: program,
      });
      const segments = segmentsOf(segmenter, makeMultiplex());
      expect(segments.length).toBe(1);
      return segments[0];
    }

    it('keeps only the reference program', () => {
      const segment = segmentOfProgram(1);

      const packets = packetsOf(segment.data);
      expect(readPat(packets[0])).toEqual([{program: 1, pid: PMT_PID}]);
      const pids = new Set(packets.map(pidOf));
      expect(pids).toEqual(new Set([0, PMT_PID, VIDEO_PID]));
      // What is left is the original single-program stream.
      expect(packets.slice(1)).toEqual(packetsOf(transportStream).slice(1));
      expect(segment.startTime).toBeCloseTo(mediaStartTime, 6);
    });

    it('can keep a program the PAT does not list first', () => {
      const segment = segmentOfProgram(2);

      const packets = packetsOf(segment.data);
      expect(readPat(packets[0])).toEqual([{program: 2, pid: OTHER_PMT_PID}]);
      const pids = new Set(packets.map(pidOf));
      expect(pids).toEqual(new Set([0, OTHER_PMT_PID, OTHER_VIDEO_PID]));
      expect(segment.startTime).toBeCloseTo(mediaStartTime, 6);
    });
  });
});
