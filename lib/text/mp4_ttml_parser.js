/** @license
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
 */
shaka.text.Mp4TtmlParser = class {
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.TtmlTextParser();
  }

  /** @override **/
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

  /** @override **/
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
    parser.parse(data, /* partialOkay */ false);

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
    'application/mp4; codecs="stpp"', shaka.text.Mp4TtmlParser);
shaka.text.TextEngine.registerParser(
    'application/mp4; codecs="stpp.TTML.im1t"', shaka.text.Mp4TtmlParser);
