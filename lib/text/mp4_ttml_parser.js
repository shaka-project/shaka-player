/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4TtmlParser');

goog.require('goog.asserts');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.Mp4TtmlParser = class {
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.TtmlTextParser();

    /**
     * The media timescale, used to turn sample durations into seconds.
     *
     * @type {?number}
     * @private
     */
    this.timescale_ = null;
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawSTPP = false;

    new Mp4Parser()
        .boxes(Mp4Parser.SAMPLE_TABLE_PATH, Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'MDHD version can only be 0 or 1');

          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          this.timescale_ = parsedMDHDBox.timescale;
        })
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('stpp', (box) => {
          sawSTPP = true;
          box.parser.stop();
        }).parse(data);

    if (!sawSTPP) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    this.parser_.setManifestType(manifestType);
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri, images) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let payload = [];
    let defaultSampleSize = null;
    let defaultSampleDuration = null;

    /** @type {!Array<Uint8Array>} */
    const mdats = [];

    /* @type {!Map<number,!Array<number>>} */
    const subSampleSizesPerSample = new Map();

    /** @type {!Array<number>} */
    const sampleSizes = [];

    /**
     * The duration of each sample, in timescale units, or null where the
     * fragment does not give one.
     * @type {!Array<?number>}
     */
    const sampleDurations = [];

    /**
     * The decode time of each sample, in timescale units.  Only differences
     * between these matter, so a fragment without a tfdt simply continues
     * from the previous one.
     * @type {!Array<number>}
     */
    const sampleDecodeTimes = [];
    let decodeTime = 0;

    const parser = new Mp4Parser()
        .boxes(Mp4Parser.FRAGMENT_PATH, Mp4Parser.children)
        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'A TFHD box should have a valid flags value');
          const parsedTFHDBox = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultSampleSize = parsedTFHDBox.defaultSampleSize;
          defaultSampleDuration = parsedTFHDBox.defaultSampleDuration;
        })
        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'TFDT version can only be 0 or 1');

          const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDTInaccurate(
              box.reader, box.version);
          decodeTime = parsedTFDTBox.baseMediaDecodeTime;
        })
        .fullBox('trun', (box) => {
          goog.asserts.assert(
              box.version != null,
              'A TRUN box should have a valid version value');
          goog.asserts.assert(
              box.flags != null,
              'A TRUN box should have a valid flags value');

          const parsedTRUNBox = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);

          for (const sample of parsedTRUNBox.sampleData) {
            const sampleSize =
                sample.sampleSize || defaultSampleSize || 0;
            sampleSizes.push(sampleSize);
            const sampleDuration =
                sample.sampleDuration || defaultSampleDuration;
            sampleDurations.push(sampleDuration);
            sampleDecodeTimes.push(decodeTime);
            decodeTime += sampleDuration || 0;
          }
        })
        .fullBox('subs', (box) => {
          const reader = box.reader;
          const entryCount = reader.readUint32();
          let currentSampleNum = -1;
          for (let i = 0; i < entryCount; i++) {
            const sampleDelta = reader.readUint32();
            currentSampleNum += sampleDelta;
            const subsampleCount = reader.readUint16();
            const subsampleSizes = [];
            for (let j = 0; j < subsampleCount; j++) {
              if (box.version == 1) {
                subsampleSizes.push(reader.readUint32());
              } else {
                subsampleSizes.push(reader.readUint16());
              }
              reader.readUint8(); // priority
              reader.readUint8(); // discardable
              reader.readUint32(); // codec_specific_parameters
            }
            subSampleSizesPerSample.set(currentSampleNum, subsampleSizes);
          }
        })
        .box('mdat', Mp4Parser.allData((data) => {
          // We collect all of the mdats first, before parsing any of them.
          // This is necessary in case the mp4 has multiple mdats.
          // They are views on the segment, not cloned, because they will be
          // concatenated and further parsed soon.
          mdats.push(data);
        }, /* clone= */ false));
    parser.parse(data, /* partialOkay= */ false);

    if (mdats.length == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    const fullData =
        shaka.util.Uint8ArrayUtils.concat(...mdats);

    const sampleTimes =
        this.getSampleTimes_(sampleDecodeTimes, sampleDurations, time);

    let sampleOffset = 0;
    for (let sampleNum = 0; sampleNum < sampleSizes.length; sampleNum++) {
      let sampleData =
          shaka.util.BufferUtils.toUint8(fullData, sampleOffset,
              sampleSizes[sampleNum]);
      sampleOffset += sampleSizes[sampleNum];

      const subSampleSizes = subSampleSizesPerSample.get(sampleNum);
      const images = [];

      if (subSampleSizes && subSampleSizes.length) {
        const contentData =
            shaka.util.BufferUtils.toUint8(sampleData, 0, subSampleSizes[0]);
        let subOffset = subSampleSizes[0];
        for (let i = 1; i < subSampleSizes.length; i++) {
          const imageData =
              shaka.util.BufferUtils.toUint8(sampleData, subOffset,
                  subSampleSizes[i]);
          const raw =
              shaka.util.Uint8ArrayUtils.toStandardBase64(imageData);
          images.push('data:image/png;base64,' + raw);
          subOffset += subSampleSizes[i];
        }
        sampleData = contentData;
      }
      payload = payload.concat(this.parser_.parseMedia(
          sampleData, sampleTimes ? sampleTimes[sampleNum] : time, uri,
          images));
    }

    return payload;
  }

  /**
   * Gives each sample of the segment the part of the timeline that is its own,
   * so that a document is clipped to its own sample rather than to the whole
   * segment, per ISO/IEC 14496-30 Section 5.9(4).  With one sample per segment
   * the two are the same thing, which is why this returns null for that case
   * and for any fragment that does not give every sample a duration: the
   * samples cannot be timed individually then, so the segment stays one unit.
   *
   * @param {!Array<number>} sampleDecodeTimes in timescale units
   * @param {!Array<?number>} sampleDurations in timescale units
   * @param {shaka.extern.TextParser.TimeContext} time
   * @return {?Array<shaka.extern.TextParser.TimeContext>}
   * @private
   */
  getSampleTimes_(sampleDecodeTimes, sampleDurations, time) {
    const timescale = this.timescale_;
    if (!timescale || sampleDurations.length < 2) {
      return null;
    }

    /** @type {!Array<number>} */
    const durations = [];
    for (const duration of sampleDurations) {
      if (!duration) {
        return null;
      }
      durations.push(duration);
    }

    const clamp = (t) =>
      Math.min(Math.max(t, time.segmentStart), time.segmentEnd);

    // The first sample starts where the segment does. Only the offsets from it
    // come from the decode times, which are on the media timeline and so
    // cannot be compared with the segment times directly.
    const baseDecodeTime = sampleDecodeTimes[0];

    /** @type {!Array<shaka.extern.TextParser.TimeContext>} */
    const sampleTimes = [];
    for (let i = 0; i < durations.length; i++) {
      const start = time.segmentStart +
          (sampleDecodeTimes[i] - baseDecodeTime) / timescale;
      const end = start + durations[i] / timescale;
      sampleTimes.push({
        periodStart: time.periodStart,
        segmentStart: clamp(start),
        segmentEnd: clamp(end),
        vttOffset: time.vttOffset,
        isMpegTs: time.isMpegTs,
      });
    }
    // The durations need not add up to the exact length of the segment, so let
    // the last sample run to the end of it, as a single sample already does.
    sampleTimes[sampleTimes.length - 1].segmentEnd = time.segmentEnd;
    return sampleTimes;
  }
};


shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im1i"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im1t"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im2i"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im2t"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.etd1"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.etd1|im1t"',
    () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im1t|etd1"',
    () => new shaka.text.Mp4TtmlParser());

// Legacy codec string uses capital "TTML", i.e.: prior to HLS rfc8216bis:
//   Note that if a Variant Stream specifies one or more Renditions that
//   include IMSC subtitles, the CODECS attribute MUST indicate this with a
//   format identifier such as "stpp.ttml.im1t".
// (https://tools.ietf.org/html/draft-pantos-hls-rfc8216bis-05#section-4.4.5.2)
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.TTML.im1t"',
    () => new shaka.text.Mp4TtmlParser());
