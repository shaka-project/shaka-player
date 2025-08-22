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
    this.parser_.setSequenceMode(sequenceMode);
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
  parseMedia(data, time, uri) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let payload = [];
    let defaultSampleSize = null;

    /** @type {!Array<Uint8Array>} */
    const mdats = [];

    /* @type {!Map<number,!Array<number>>} */
    const subSampleSizesPerSample = new Map();

    /** @type {!Array<number>} */
    const sampleSizes = [];

    const parser = new Mp4Parser()
        .box('moof', Mp4Parser.children)
        .box('traf', Mp4Parser.children)
        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'A TFHD box should have a valid flags value');
          const parsedTFHDBox = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultSampleSize = parsedTFHDBox.defaultSampleSize;
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
          mdats.push(data);
        }));
    parser.parse(data, /* partialOkay= */ false);

    if (mdats.length == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.INVALID_MP4_TTML);
    }

    const fullData =
        shaka.util.Uint8ArrayUtils.concat(...mdats);

    let sampleOffset = 0;
    for (let sampleNum = 0; sampleNum < sampleSizes.length; sampleNum++) {
      const sampleData =
          shaka.util.BufferUtils.toUint8(fullData, sampleOffset,
              sampleSizes[sampleNum]);
      sampleOffset += sampleSizes[sampleNum];

      const subSampleSizes = subSampleSizesPerSample.get(sampleNum);

      if (subSampleSizes && subSampleSizes.length) {
        const contentData =
            shaka.util.BufferUtils.toUint8(sampleData, 0, subSampleSizes[0]);
        const images = [];
        let subOffset = subSampleSizes[0];
        for (let i = 1; i < subSampleSizes.length; i++) {
          const imageData =
              shaka.util.BufferUtils.toUint8(data, subOffset,
                  subSampleSizes[i]);
          const raw =
              shaka.util.Uint8ArrayUtils.toStandardBase64(imageData);
          images.push('data:image/png;base64,' + raw);
          subOffset += subSampleSizes[i];
        }
        payload = payload.concat(
            this.parser_.parseMedia(contentData, time, uri, images));
      } else {
        payload = payload.concat(
            this.parser_.parseMedia(sampleData, time, uri,
                /* images= */ []));
      }
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
