/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.TsParser');


/**
 * @summary Utility functions for segment parsing.
 */
shaka.media.SegmentUtils = class {
  /**
   * @param {string} mimeType
   * @return {shaka.media.SegmentUtils.BasicInfo}
   */
  static getBasicInfoFromMimeType(mimeType) {
    const baseMimeType = shaka.util.MimeUtils.getBasicType(mimeType);
    const type = baseMimeType.split('/')[0];
    const codecs = shaka.util.MimeUtils.getCodecs(mimeType);
    return {
      type: type,
      mimeType: baseMimeType,
      codecs: codecs,
      language: null,
      height: null,
      width: null,
      channelCount: null,
      sampleRate: null,
      closedCaptions: new Map(),
    };
  }

  /**
   * @param {!BufferSource} data
   * @return {?shaka.media.SegmentUtils.BasicInfo}
   */
  static getBasicInfoFromTs(data) {
    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);
    const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
    const tsCodecs = tsParser.getCodecs();
    const videoInfo = tsParser.getVideoInfo();
    const codecs = [];
    let hasAudio = false;
    let hasVideo = false;
    switch (tsCodecs.audio) {
      case 'aac':
        codecs.push('mp4a.40.2');
        hasAudio = true;
        break;
      case 'mp3':
        codecs.push('mp4a.40.34');
        hasAudio = true;
        break;
      case 'ac3':
        codecs.push('ac-3');
        hasAudio = true;
        break;
      case 'ec3':
        codecs.push('ec-3');
        hasAudio = true;
        break;
    }
    switch (tsCodecs.video) {
      case 'avc':
        if (videoInfo.codec) {
          codecs.push(videoInfo.codec);
        } else {
          codecs.push('avc1.42E01E');
        }
        hasVideo = true;
        break;
      case 'hvc':
        if (videoInfo.codec) {
          codecs.push(videoInfo.codec);
        } else {
          codecs.push('hvc1.1.6.L93.90');
        }
        hasVideo = true;
        break;
    }
    if (!codecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    const closedCaptions = new Map();
    if (hasVideo) {
      const captionParser = new shaka.media.ClosedCaptionParser('video/mp2t');
      captionParser.parseFrom(data);
      for (const stream of captionParser.getStreams()) {
        closedCaptions.set(stream, stream);
      }
      captionParser.reset();
    }
    return {
      type: onlyAudio ? 'audio' : 'video',
      mimeType: 'video/mp2t',
      codecs: codecs.join(', '),
      language: null,
      height: videoInfo.height,
      width: videoInfo.width,
      channelCount: null,
      sampleRate: null,
      closedCaptions: closedCaptions,
    };
  }

  /**
   * @param {?BufferSource} initData
   * @param {!BufferSource} data
   * @return {?shaka.media.SegmentUtils.BasicInfo}
   */
  static getBasicInfoFromMp4(initData, data) {
    const Mp4Parser = shaka.util.Mp4Parser;
    const SegmentUtils = shaka.media.SegmentUtils;

    const codecs = [];

    let hasAudio = false;
    let hasVideo = false;

    const addCodec = (codec) => {
      const codecLC = codec.toLowerCase();
      switch (codecLC) {
        case 'avc1':
        case 'avc3':
          codecs.push(codecLC + '.42E01E');
          hasVideo = true;
          break;
        case 'hev1':
        case 'hvc1':
          codecs.push(codecLC + '.1.6.L93.90');
          hasVideo = true;
          break;
        case 'dvh1':
        case 'dvhe':
          codecs.push(codecLC + '.05.04');
          hasVideo = true;
          break;
        case 'vp09':
          codecs.push(codecLC + '.00.10.08');
          hasVideo = true;
          break;
        case 'av01':
          codecs.push(codecLC + '.0.01M.08');
          hasVideo = true;
          break;
        case 'mp4a':
          // We assume AAC, but this can be wrong since mp4a supports
          // others codecs
          codecs.push('mp4a.40.2');
          hasAudio = true;
          break;
        case 'ac-3':
        case 'ec-3':
        case 'opus':
        case 'flac':
          codecs.push(codecLC);
          hasAudio = true;
          break;
      }
    };

    const codecBoxParser = (box) => addCodec(box.name);

    /** @type {?string} */
    let language = null;
    /** @type {?string} */
    let height = null;
    /** @type {?string} */
    let width = null;
    /** @type {?number} */
    let channelCount = null;
    /** @type {?number} */
    let sampleRate = null;

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsedTKHDBox = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version);
          height = String(parsedTKHDBox.height);
          width = String(parsedTKHDBox.width);
        })
        .box('mdia', Mp4Parser.children)
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'MDHD is a full box and should have a valid version.');
          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          language = parsedMDHDBox.language;
        })
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)

        // AUDIO
        // These are the various boxes that signal a codec.
        .box('mp4a', (box) => {
          const parsedMP4ABox = shaka.util.Mp4BoxParsers.parseMP4A(box.reader);
          channelCount = parsedMP4ABox.channelCount;
          sampleRate = parsedMP4ABox.sampleRate;
          if (box.reader.hasMoreData()) {
            Mp4Parser.children(box);
          } else {
            codecBoxParser(box);
          }
        })
        .box('esds', (box) => {
          const parsedESDSBox = shaka.util.Mp4BoxParsers.parseESDS(box.reader);
          codecs.push(parsedESDSBox.codec);
          hasAudio = true;
        })
        .box('ac-3', codecBoxParser)
        .box('ec-3', codecBoxParser)
        .box('opus', codecBoxParser)
        .box('Opus', codecBoxParser)
        .box('fLaC', codecBoxParser)

        // VIDEO
        // These are the various boxes that signal a codec.
        .box('avc1', (box) => {
          const parsedAVCBox =
              shaka.util.Mp4BoxParsers.parseAVC(box.reader, box.name);
          codecs.push(parsedAVCBox.codec);
          hasVideo = true;
        })
        .box('avc3', (box) => {
          const parsedAVCBox =
              shaka.util.Mp4BoxParsers.parseAVC(box.reader, box.name);
          codecs.push(parsedAVCBox.codec);
          hasVideo = true;
        })
        .box('hev1', codecBoxParser)
        .box('hvc1', codecBoxParser)
        .box('dvh1', codecBoxParser)
        .box('dvhe', codecBoxParser)
        .box('vp09', codecBoxParser)
        .box('av01', codecBoxParser)

        // This signals an encrypted sample, which we can go inside of to
        // find the codec used.
        // Note: If encrypted, you can only have audio or video, not both.
        .box('enca', Mp4Parser.visualSampleEntry)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('sinf', Mp4Parser.children)
        .box('frma', (box) => {
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          addCodec(codec);
        })

        .parse(initData || data, /* partialOkay= */ true);
    if (!codecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    const closedCaptions = new Map();
    if (hasVideo) {
      const captionParser = new shaka.media.ClosedCaptionParser('video/mp4');
      if (initData) {
        captionParser.init(initData);
      }
      captionParser.parseFrom(data);
      for (const stream of captionParser.getStreams()) {
        closedCaptions.set(stream, stream);
      }
      captionParser.reset();
    }
    return {
      type: onlyAudio ? 'audio' : 'video',
      mimeType: onlyAudio ? 'audio/mp4' : 'video/mp4',
      codecs: SegmentUtils.filterDuplicateCodecs_(codecs).join(', '),
      language: language,
      height: height,
      width: width,
      channelCount: channelCount,
      sampleRate: sampleRate,
      closedCaptions: closedCaptions,
    };
  }

  /**
   * @param {!Array.<string>} codecs
   * @return {!Array.<string>} codecs
   * @private
   */
  static filterDuplicateCodecs_(codecs) {
    // Filter out duplicate codecs.
    const seen = new Set();
    const ret = [];
    for (const codec of codecs) {
      const shortCodec = shaka.util.MimeUtils.getCodecBase(codec);
      if (!seen.has(shortCodec)) {
        ret.push(codec);
        seen.add(shortCodec);
      } else {
        shaka.log.debug('Ignoring duplicate codec');
      }
    }
    return ret;
  }
};


/**
 * @typedef {{
 *   type: string,
 *   mimeType: string,
 *   codecs: string,
 *   language: ?string,
 *   height: ?string,
 *   width: ?string,
 *   channelCount: ?number,
 *   sampleRate: ?number,
 *   closedCaptions: Map.<string, string>
 * }}
 *
 * @property {string} type
 * @property {string} mimeType
 * @property {string} codecs
 * @property {?string} language
 * @property {?string} height
 * @property {?string} width
 * @property {?number} channelCount
 * @property {?number} sampleRate
 * @property {Map.<string, string>} closedCaptions
 */
shaka.media.SegmentUtils.BasicInfo;
