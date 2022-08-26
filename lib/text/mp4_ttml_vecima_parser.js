/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4TtmlVecimaParser');

goog.require('goog.asserts');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Mp4BoxParsers');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.Mp4TtmlVecimaParser = class {
  /** */
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.TtmlTextParser();

    /**
     * The current time scale used by the VTT parser.
     *
     * @type {number}
     * @private
     */
    this.timescale_ = 0;
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
        .box('TTML', (box) => {
          sawSTPP = true;
          box.parser.stop();
        }).parse(data);

    if (!sawSTPP) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    if (!this.timescale_) {
      // Missing timescale for VTT content. It should be located in the MDHD.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_VTT);
    }
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawTFDT = false;
    let sawMDAT = false;
    let payload = [];

    const parser = new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version == 0 || box.version == 1,
              'tfdt version can only be 0 or 1');

          sawTFDT = true;
          const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);

          if (parsedTFDTBox.baseMediaDecodeTime) {
            time.periodStart =
            parsedTFDTBox.baseMediaDecodeTime / this.timescale_;
          } else if (parsedTFDTBox.baseMediaDecodeTimeEx) {
            const baseTime = parsedTFDTBox.baseMediaDecodeTimeEx;
            time.periodStart = Math.floor(
                (baseTime.high / this.timescale_) * Math.pow(2, 32) +
              baseTime.low / this.timescale_);
          }
        })
        .box('tfhd', Mp4Parser.children)
        .box('trun', Mp4Parser.children)
        .box('mdat', Mp4Parser.allData((data) => {
          sawMDAT = true;
          // Join this to any previous payload, in case the mp4 has multiple
          // mdats.
          payload = payload.concat(this.parser_.parseMedia(data, time));
        }));
    parser.parse(data, /* partialOkay= */ false);

    if (!sawMDAT && !sawTFDT) {
      // A required box is missing.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    return payload;
  }
};

shaka.text.TextEngine.registerParser(
    'text/vtt; codecs="stpp.ttml.im1t"',
    () => new shaka.text.Mp4TtmlVecimaParser());

shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.ttml.im1t"',
    () => new shaka.text.Mp4TtmlVecimaParser(),
);
