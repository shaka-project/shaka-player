/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Mp4TtmlParser');

goog.require('shaka.text.TextEngine');
goog.require('shaka.text.TtmlTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Uint8ArrayUtils');


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
  setManifestType(manifestType) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time, uri) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let sawMDAT = false;
    let payload = [];

    /** @type {!Array.<number>} */
    let subSizes = [];

    const parser = new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('subs', (box) => {
          subSizes = [];
          const reader = box.reader;
          const entryCount = reader.readUint32();
          for (let i = 0; i < entryCount; i++) {
            reader.readUint32(); // sample_delta
            const subsampleCount = reader.readUint16();
            for (let j = 0; j < subsampleCount; j++) {
              if (box.version == 1) {
                subSizes.push(reader.readUint32());
              } else {
                subSizes.push(reader.readUint16());
              }
              reader.readUint8(); // priority
              reader.readUint8(); // discardable
              reader.readUint32(); // codec_specific_parameters
            }
          }
        })
        .box('mdat', Mp4Parser.allData((data) => {
          sawMDAT = true;
          // Join this to any previous payload, in case the mp4 has multiple
          // mdats.
          if (subSizes.length) {
            const contentData =
                shaka.util.BufferUtils.toUint8(data, 0, subSizes[0]);
            const images = [];
            let offset = subSizes[0];
            for (let i = 1; i < subSizes.length; i++) {
              const imageData =
                  shaka.util.BufferUtils.toUint8(data, offset, subSizes[i]);
              const raw =
                  shaka.util.Uint8ArrayUtils.toStandardBase64(imageData);
              images.push('data:image/png;base64,' + raw);
              offset += subSizes[i];
            }
            payload = payload.concat(
                this.parser_.parseMedia(contentData, time, uri, images));
          } else {
            payload = payload.concat(
                this.parser_.parseMedia(data, time, uri, /* images= */ []));
          }
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
