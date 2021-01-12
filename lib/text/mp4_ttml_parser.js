/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4TtmlParser');

goog.require('goog.asserts');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.Mp4TtmlParser = class {
  /** */
  constructor() {
    /**
     * The current time scale used by the TTML parser.
     *
     * @type {?number}
     * @private
     */
    this.timescale_ = null;
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.TtmlTextParser();
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawSTPP = false;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'MDHD version can only be 0 or 1');

          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          this.timescale_ = parsedMDHDBox.timescale;
        })
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
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
  parseMedia(data, time) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let baseTime = 0;
    /** @type {!Array.<shaka.util.ParsedTRUNSample>} */
    let presentations = [];
    /** @type {!Array.<shaka.text.Cue>} */
    let allCues = [];

    let sawMDAT = false;
    let defaultDuration = null;

    const parser = new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'TFDT version can only be 0 or 1');

          const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);
          baseTime = parsedTFDTBox.baseMediaDecodeTime;
        })
        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'A TFHD box should have a valid flags value');
          const parsedTFHDBox = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultDuration = parsedTFHDBox.defaultSampleDuration;
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
          presentations = parsedTRUNBox.sampleData;
        })
        .box('mdat', (box) => {
          sawMDAT = true;

          if (presentations.length > 0) {
            let currentTime = baseTime;
            for (const presentation of presentations) {
              goog.asserts.assert(
                  this.timescale_ != null, 'Timescale should not be null!');
              goog.asserts.assert(
                  presentation.sampleSize != null,
                  'Sample size should not be null!');

              const duration = presentation.sampleDuration || defaultDuration;
              const startTime = presentation.sampleCompositionTimeOffset ?
                  baseTime + presentation.sampleCompositionTimeOffset :
                  currentTime;
              currentTime = startTime + (duration || 0);

              const bytes = box.reader.readBytes(presentation.sampleSize);
              const cues = this.parser_.parseMedia(bytes, time);

              // Time must be within the presentation
              for (const cue of cues) {
                const pStartTime = time.periodStart + startTime /
                    this.timescale_;
                if (cue.startTime < pStartTime) {
                  cue.startTime = pStartTime;
                }
                const pEndTime = time.periodStart + currentTime /
                    this.timescale_;
                if (cue.endTime > pEndTime) {
                  cue.endTime = pEndTime;
                }
              }
              allCues = allCues.concat(cues);
            }
          } else {
            // Join this to any previous payload, in case the mp4 has multiple
            // mdats.
            const all = box.reader.getLength() - box.reader.getPosition();
            const bytes = box.reader.readBytes(all);
            allCues = allCues.concat(this.parser_.parseMedia(bytes, time));
          }
        });
    parser.parse(data, /* partialOkay= */ false);

    if (!sawMDAT) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    return /** @type {!Array.<!shaka.extern.Cue>} */ (
      allCues.filter(shaka.util.Functional.isNotNull));
  }
};


shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im1t"',
    () => new shaka.text.Mp4TtmlParser());
// Legacy codec string uses capital "TTML", i.e.: prior to HLS rfc8216bis:
//   Note that if a Variant Stream specifies one or more Renditions that
//   include IMSC subtitles, the CODECS attribute MUST indicate this with a
//   format identifier such as "stpp.ttml.im1t".
// (https://tools.ietf.org/html/draft-pantos-hls-rfc8216bis-05#section-4.4.5.2)
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.TTML.im1t"',
    () => new shaka.text.Mp4TtmlParser());
