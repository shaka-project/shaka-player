/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4TtmlParser');

goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.Mp4TtmlParser = class {
  /** */
  constructor() {
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
  setSequenceMode(sequenceMode) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawMDAT = false;
    let payload = [];

    const parser = new Mp4Parser()
        .box('mdat', Mp4Parser.allData((data) => {
          sawMDAT = true;
          // Join this to any previous payload, in case the mp4 has multiple
          // mdats.
          payload = payload.concat(this.parser_.parseMedia(data, time));
        }));
    parser.parse(data, /* partialOkay= */ false);

    if (!sawMDAT) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    return payload;
  }
};


shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp"', () => new shaka.text.Mp4TtmlParser());
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml"',
    () => new shaka.text.Mp4TtmlParser());
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
