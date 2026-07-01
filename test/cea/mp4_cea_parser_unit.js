/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4CeaParser', () => {
  const ceaInitSegmentUri = '/base/test/test/assets/cea-init.mp4';
  const ceaSegmentUri = '/base/test/test/assets/cea-segment.mp4';
  const h265ceaInitSegmentUri = '/base/test/test/assets/h265-cea-init.mp4';
  const h265ceaSegmentUri = '/base/test/test/assets/h265-cea-segment.mp4';
  const multipleTrunInitSegmentUri =
      '/base/test/test/assets/multiple-trun-init.mp4';
  const multipleTrunSegmentUri =
      '/base/test/test/assets/multiple-trun-segment.mp4';
  const cea608TrackInitSegmentUri =
      '/base/test/test/assets/cea608-track-init.mp4';
  const cea608TrackSegmentUri =
      '/base/test/test/assets/cea608-track-segment.mp4';
  const cea608InterleavedTrunSegmentUri =
      '/base/test/test/assets/cea608-interleaved-trun-segment.mp4';
  const ceaInterleavedTrunSegmentUri =
      '/base/test/test/assets/cea-interleaved-trun-segment.mp4';

  const Util = shaka.test.Util;

  /** @type {!ArrayBuffer} */
  let ceaInitSegment;
  /** @type {!ArrayBuffer} */
  let ceaSegment;
  /** @type {!ArrayBuffer} */
  let h265ceaInitSegment;
  /** @type {!ArrayBuffer} */
  let h265ceaSegment;
  /** @type {!ArrayBuffer} */
  let multipleTrunInitSegment;
  /** @type {!ArrayBuffer} */
  let multipleTrunSegment;
  /** @type {!ArrayBuffer} */
  let cea608TrackInitSegment;
  /** @type {!ArrayBuffer} */
  let cea608TrackSegment;
  /** @type {!ArrayBuffer} */
  let cea608InterleavedTrunSegment;
  /** @type {!ArrayBuffer} */
  let ceaInterleavedTrunSegment;

  beforeAll(async () => {
    [
      ceaInitSegment,
      ceaSegment,
      h265ceaInitSegment,
      h265ceaSegment,
      multipleTrunInitSegment,
      multipleTrunSegment,
      cea608TrackInitSegment,
      cea608TrackSegment,
      cea608InterleavedTrunSegment,
      ceaInterleavedTrunSegment,
    ] = await Promise.all([
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
      shaka.test.Util.fetch(h265ceaInitSegmentUri),
      shaka.test.Util.fetch(h265ceaSegmentUri),
      shaka.test.Util.fetch(multipleTrunInitSegmentUri),
      shaka.test.Util.fetch(multipleTrunSegmentUri),
      shaka.test.Util.fetch(cea608TrackInitSegmentUri),
      shaka.test.Util.fetch(cea608TrackSegmentUri),
      shaka.test.Util.fetch(cea608InterleavedTrunSegmentUri),
      shaka.test.Util.fetch(ceaInterleavedTrunSegmentUri),
    ]);
  });

  it('parses cea data from mp4 stream', () => {
    const cea708Parser = new shaka.cea.Mp4CeaParser();

    const expectedCea708Packet = new Uint8Array([
      0xb5, 0x00, 0x31, 0x47, 0x41, 0x39, 0x34, 0x03,
      0xce, 0xff, 0xfd, 0x94, 0x20, 0xfd, 0x94, 0xae,
      0xfd, 0x91, 0x62, 0xfd, 0x73, 0xf7, 0xfd, 0xe5,
      0xba, 0xfd, 0x91, 0xb9, 0xfd, 0xb0, 0xb0, 0xfd,
      0xba, 0xb0, 0xfd, 0xb0, 0xba, 0xfd, 0xb0, 0x31,
      0xfd, 0xba, 0xb0, 0xfd, 0xb0, 0x80, 0xfd, 0x94,
      0x2c, 0xfd, 0x94, 0x2f, 0xff,
    ]);

    cea708Parser.init(ceaInitSegment);
    const cea708Packets = cea708Parser.parse(ceaSegment);
    expect(cea708Packets).toBeDefined();
    expect(cea708Packets.length).toBe(4);
    expect(cea708Packets[cea708Packets.length - 1].packet)
        .toEqual(expectedCea708Packet);
  });

  it('parses cea data from an h265 mp4 stream', () => {
    const ceaParser = new shaka.cea.Mp4CeaParser();

    ceaParser.init(h265ceaInitSegment);
    const ceaPackets = ceaParser.parse(h265ceaSegment);
    expect(ceaPackets).toBeDefined();
    expect(ceaPackets.length).toBe(60);
  });

  it('parses cea data from a segment with multiple trun boxes', () => {
    const ceaParser = new shaka.cea.Mp4CeaParser();

    ceaParser.init(multipleTrunInitSegment);
    const ceaPackets = ceaParser.parse(multipleTrunSegment);
    // The first trun box references samples with 48 CEA packets.
    // The second trun box references samples with 132 more, for a total of 180.
    expect(ceaPackets.length).toBe(180);
  });

  it('reads each SEI run from its own data offset', () => {
    // Regression test: a track's runs can be interleaved with another track's
    // data in a shared mdat, so the samples described by different trun boxes
    // are not contiguous. Each run must be read from its own trun data offset,
    // walking only the NAL units bounded by each sample size. Reading runs
    // contiguously would parse the in-between bytes of the other track as if
    // they were this track's NAL units.
    //
    // The fixture has two non-contiguous SEI runs (payloads 0xA1.. and
    // 0x11 0x22..) separated by a different SEI NAL (payload 0xDE 0xAD..) that
    // belongs to neither run. The fixed parser reads exactly the two runs; the
    // old contiguous parser would also pick up the in-between SEI.
    const ceaParser = new shaka.cea.Mp4CeaParser();

    ceaParser.init(ceaInitSegment);
    const ceaPackets = ceaParser.parse(ceaInterleavedTrunSegment);
    expect(ceaPackets.length).toBe(2);
    expect(ceaPackets[0].packet).toEqual(
        new Uint8Array([0xa1, 0xa1, 0xa1, 0xa1, 0xa1, 0xa1, 0xa1, 0xa1]));
    // The second packet must come from the second run, not the SEI bytes that
    // physically sit between the two runs.
    expect(ceaPackets[1].packet).toEqual(
        new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88]));
  });

  it('parses cea 608 track from mp4 stream', () => {
    const ceaParser = new shaka.cea.Mp4CeaParser();

    ceaParser.init(cea608TrackInitSegment);
    const ceaPackets = ceaParser.parse(cea608TrackSegment);
    expect(ceaPackets).toBeDefined();
    expect(ceaPackets.length).toBe(2);
  });

  it('reads each c608 run from its own data offset', () => {
    // Regression test: in an Apple HLS stream, the CEA-608 ('c608') track's
    // runs can be interleaved with the video runs inside a shared mdat, so the
    // samples described by different trun boxes are not contiguous. Reading the
    // second sample contiguously (right after the first) instead of from its
    // own trun data offset picks up bytes belonging to the video track, which
    // can pass the CEA-608 parity check and render as garbage characters.
    const ceaParser = new shaka.cea.Mp4CeaParser();

    ceaParser.init(cea608TrackInitSegment);
    const ceaPackets = ceaParser.parse(cea608InterleavedTrunSegment);
    expect(ceaPackets.length).toBe(2);
    // The second packet must be the clean 'cdat' atom referenced by the second
    // trun, not the video bytes that physically follow the first sample.
    expect(ceaPackets[1].packet).toEqual(new Uint8Array([
      0x00, 0x00, 0x00, 0x0c, 0x63, 0x64, 0x61, 0x74, 0x94, 0x2c, 0x94, 0x2c,
    ]));
  });

  it('parses an invalid init segment', () => {
    const cea708Parser = new shaka.cea.Mp4CeaParser();

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_CEA));

    expect(() => {
      cea708Parser.init(ceaSegment);
    }).toThrow(expected);
  });
});
