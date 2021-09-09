/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('shaka.test.Util');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');

describe('Mp4BoxParsers', () => {
  const videoInitSegmentUri = '/base/test/test/assets/sintel-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/sintel-video-segment.mp4';

  /** @type {!ArrayBuffer} */
  let videoInitSegment;
  /** @type {!ArrayBuffer} */
  let videoSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
    ]);
    videoInitSegment = responses[0];
    videoSegment = responses[1];
  });

  it('parses init segment', () => {
    let trexParsed = false;
    let tkhdParsed = false;
    let mdhdParsed = false;
    let defaultSampleDuration;
    let defaultSampleSize;
    let trackId;
    let timescale;

    const expectedDefaultSampleDuration = 512;
    const expectedDefaultSampleSize = 0;
    const expectedTrackId = 1;
    const expectedTimescale = 12288;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('mvex', Mp4Parser.children)
        .fullBox('trex', (box) => {
          const parsedTREXBox = shaka.util.Mp4BoxParsers.parseTREX(
              box.reader);

          defaultSampleDuration = parsedTREXBox.defaultSampleDuration;
          defaultSampleSize = parsedTREXBox.defaultSampleSize;
          trexParsed = true;
        })
        .box('trak', Mp4Parser.children)
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsedTKHDBox = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version);
          trackId = parsedTKHDBox.trackId;
          tkhdParsed = true;
        })
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'MDHD is a full box and should have a valid version.');
          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          timescale = parsedMDHDBox.timescale;
          mdhdParsed = true;
        })
        .parse(videoInitSegment, /* partialOkay= */ true);

    expect(trexParsed).toBe(true);
    expect(tkhdParsed).toBe(true);
    expect(mdhdParsed).toBe(true);
    expect(defaultSampleDuration).toBe(expectedDefaultSampleDuration);
    expect(defaultSampleSize).toBe(expectedDefaultSampleSize);
    expect(trackId).toBe(expectedTrackId);
    expect(timescale).toBe(expectedTimescale);
  });

  it('parses video segment', () => {
    let trunParsed = false;
    let tfhdParsed = false;
    let tfdtParsed = false;
    let sampleCount;
    let sampleData;
    let defaultSampleDuration;
    let baseMediaDecodeTime;

    const expectedSampleCount = 240;
    const expectedDefaultSampleDuration = 512;
    const expectedBaseMediaDecodeTime = 491520;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('trun', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TRUN is a full box and should have a valid version.');
          goog.asserts.assert(
              box.flags != null,
              'TRUN is a full box and should have valid flags.');

          const parsedTRUN = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);

          sampleCount = parsedTRUN.sampleCount;
          sampleData = parsedTRUN.sampleData;
          trunParsed = true;
        })

        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'TFHD is a full box and should have valid flags.');

          const parsedTFHD = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultSampleDuration = parsedTFHD.defaultSampleDuration;
          tfhdParsed = true;
        })

        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TFDT is a full box and should have a valid version.');

          const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);

          baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;
          tfdtParsed = true;
        }).parse(videoSegment, /* partialOkay= */ false);

    expect(trunParsed).toBe(true);
    expect(tfhdParsed).toBe(true);
    expect(tfdtParsed).toBe(true);
    expect(sampleCount).toBe(expectedSampleCount);
    expect(sampleData).toBeDefined();
    expect(Array.isArray(sampleData)).toBe(true);
    expect(defaultSampleDuration).toBe(expectedDefaultSampleDuration);
    expect(baseMediaDecodeTime).toBe(expectedBaseMediaDecodeTime);
  });

  /**
   * Test on parsing an incomplete TKHD V1 box, since the parser doesn't
   * parse the other fields
   *
   * Explanation on the Uint8Array:
   * [
   * <creation_time, 8 bytes>,
   * <modification_time, 8 bytes>,
   * <track_id, 4 bytes>
   * ]
   *
   * Time is a 32B integer expressed in seconds since Jan 1, 1904, 0000 UTC
   *
   */
  it('parses TKHD v1 box', () => {
    const tkhdBox = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0xDC, 0xBF, 0x0F, 0xD7, // Creation time
      0x00, 0x00, 0x00, 0x00, 0xDC, 0xBF, 0x0F, 0xD7, // Modification time
      0x00, 0x00, 0x00, 0x01, // Track ID
      // Remaining fields are not processed in parseTKHD()
    ]);
    const reader = new shaka.util.DataViewReader(
        tkhdBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    const parsedTkhd = shaka.util.Mp4BoxParsers
        .parseTKHD(reader, /* version= */ 1);
    expect(parsedTkhd.trackId).toBe(1);
  });
});
