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

  beforeAll(async () => {
    [
      ceaInitSegment,
      ceaSegment,
      h265ceaInitSegment,
      h265ceaSegment,
      multipleTrunInitSegment,
      multipleTrunSegment,
    ] = await Promise.all([
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
      shaka.test.Util.fetch(h265ceaInitSegmentUri),
      shaka.test.Util.fetch(h265ceaSegmentUri),
      shaka.test.Util.fetch(multipleTrunInitSegmentUri),
      shaka.test.Util.fetch(multipleTrunSegmentUri),
    ]);
  });

  /**
   * Test only the functionality of removing EPB
   * Expect removeEmu() to return the NALU with correct length
   *
   * Chromium VDA has a strict standard on NALU length
   * It will complain about conformance if the array is malformed
   *
   * If EPB is removed by shifting bytes, it will return the original NALU
   * length, which will fail this test
   *
   * Note that the CEA-608 packet in this test is incomplete
   */
  it('parses CEA-608 SEI data from MP4 H.264 stream', () => {
    const seiProcessor = new shaka.cea.SeiProcessor();

    const cea608Packet = new Uint8Array([
      0x00, 0x00, 0x03, // Emulation prevention byte
    ]);

    const naluData = seiProcessor.removeEmu(cea608Packet);
    expect(naluData).toBeDefined();

    // EPB should be removed by returning new array, not by shifting bytes
    expect(naluData.length).toBe(2);
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
