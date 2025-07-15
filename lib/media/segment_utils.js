/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SegmentUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.ManifestParserUtils');
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
      videoRange: null,
      colorGamut: null,
      frameRate: null,
    };
  }

  /**
   * @param {!BufferSource} data
   * @param {boolean} disableAudio
   * @param {boolean} disableVideo
   * @param {boolean} disableText
   * @return {?shaka.media.SegmentUtils.BasicInfo}
   */
  static getBasicInfoFromTs(data, disableAudio, disableVideo, disableText) {
    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);
    const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
    const tsCodecs = tsParser.getCodecs();
    const videoInfo = tsParser.getVideoInfo();
    const codecs = [];
    let hasAudio = false;
    let hasVideo = false;
    if (!disableAudio) {
      switch (tsCodecs.audio) {
        case 'aac':
        case 'aac-loas':
          if (tsParser.getAudioData().length) {
            codecs.push('mp4a.40.2');
            hasAudio = true;
          }
          break;
        case 'mp3':
          if (tsParser.getAudioData().length) {
            codecs.push('mp4a.40.34');
            hasAudio = true;
          }
          break;
        case 'ac3':
          if (tsParser.getAudioData().length) {
            codecs.push('ac-3');
            hasAudio = true;
          }
          break;
        case 'ec3':
          if (tsParser.getAudioData().length) {
            codecs.push('ec-3');
            hasAudio = true;
          }
          break;
        case 'opus':
          if (tsParser.getAudioData().length) {
            codecs.push('opus');
            hasAudio = true;
          }
          break;
      }
    }
    if (!disableVideo) {
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
        case 'av1':
          codecs.push('av01.0.01M.08');
          hasVideo = true;
          break;
      }
    }
    if (!codecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    const closedCaptions = new Map();
    if (hasVideo && !disableText) {
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
      videoRange: null,
      colorGamut: null,
      frameRate: videoInfo.frameRate,
    };
  }

  /**
   * @param {?BufferSource} initData
   * @param {!BufferSource} data
   * @param {boolean} disableText
   * @return {?shaka.media.SegmentUtils.BasicInfo}
   */
  static getBasicInfoFromMp4(initData, data, disableText) {
    const Mp4Parser = shaka.util.Mp4Parser;
    const SegmentUtils = shaka.media.SegmentUtils;

    const audioCodecs = [];
    let videoCodecs = [];

    let hasAudio = false;
    let hasVideo = false;

    const addCodec = (codec) => {
      const codecLC = codec.toLowerCase();
      switch (codecLC) {
        case 'avc1':
        case 'avc3':
          videoCodecs.push(codecLC + '.42E01E');
          hasVideo = true;
          break;
        case 'hev1':
        case 'hvc1':
          videoCodecs.push(codecLC + '.1.6.L93.90');
          hasVideo = true;
          break;
        case 'dvh1':
        case 'dvhe':
          videoCodecs.push(codecLC + '.05.04');
          hasVideo = true;
          break;
        case 'vp09':
          videoCodecs.push(codecLC + '.00.10.08');
          hasVideo = true;
          break;
        case 'av01':
          videoCodecs.push(codecLC + '.0.01M.08');
          hasVideo = true;
          break;
        case 'mp4a':
          // We assume AAC, but this can be wrong since mp4a supports
          // others codecs
          audioCodecs.push('mp4a.40.2');
          hasAudio = true;
          break;
        case 'ac-3':
        case 'ec-3':
        case 'ac-4':
        case 'opus':
        case 'flac':
          audioCodecs.push(codecLC);
          hasAudio = true;
          break;
        case 'apac':
          audioCodecs.push('apac.31.00');
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
    /** @type {?string} */
    let realVideoRange = null;
    /** @type {?string} */
    let realColorGamut = null;
    /** @type {?string} */
    const realFrameRate = null;

    /** @type {?string} */
    let baseBox;

    const genericAudioBox = (box) => {
      const parsedAudioSampleEntryBox =
          shaka.util.Mp4BoxParsers.audioSampleEntry(box.reader);
      channelCount = parsedAudioSampleEntryBox.channelCount;
      sampleRate = parsedAudioSampleEntryBox.sampleRate;
      codecBoxParser(box);
    };

    const genericVideoBox = (box) => {
      baseBox = box.name;
      const parsedVisualSampleEntryBox =
          shaka.util.Mp4BoxParsers.visualSampleEntry(box.reader);
      width = String(parsedVisualSampleEntryBox.width);
      height = String(parsedVisualSampleEntryBox.height);
      if (box.reader.hasMoreData()) {
        Mp4Parser.children(box);
      }
    };

    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
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
          const parsedAudioSampleEntryBox =
              shaka.util.Mp4BoxParsers.audioSampleEntry(box.reader);
          channelCount = parsedAudioSampleEntryBox.channelCount;
          sampleRate = parsedAudioSampleEntryBox.sampleRate;
          if (box.reader.hasMoreData()) {
            Mp4Parser.children(box);
          } else {
            codecBoxParser(box);
          }
        })
        .box('esds', (box) => {
          const parsedESDSBox = shaka.util.Mp4BoxParsers.parseESDS(box.reader);
          audioCodecs.push(parsedESDSBox.codec);
          hasAudio = true;
        })
        .box('ac-3', genericAudioBox)
        .box('ec-3', genericAudioBox)
        .box('ac-4', genericAudioBox)
        .box('Opus', genericAudioBox)
        .box('fLaC', genericAudioBox)
        .box('apac', genericAudioBox)

        // VIDEO
        // These are the various boxes that signal a codec.
        .box('avc1', genericVideoBox)
        .box('avc3', genericVideoBox)
        .box('hev1', genericVideoBox)
        .box('hvc1', genericVideoBox)
        .box('dva1', genericVideoBox)
        .box('dvav', genericVideoBox)
        .box('dvh1', genericVideoBox)
        .box('dvhe', genericVideoBox)
        .box('vp09', genericVideoBox)
        .box('av01', genericVideoBox)
        .box('avcC', (box) => {
          let codecBase = baseBox || '';
          switch (baseBox) {
            case 'dvav':
              codecBase = 'avc3';
              break;
            case 'dva1':
              codecBase = 'avc1';
              break;
          }
          const parsedAVCCBox = shaka.util.Mp4BoxParsers.parseAVCC(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedAVCCBox.codec);
          hasVideo = true;
        })
        .box('hvcC', (box) => {
          let codecBase = baseBox || '';
          switch (baseBox) {
            case 'dvh1':
              codecBase = 'hvc1';
              break;
            case 'dvhe':
              codecBase = 'hev1';
              break;
          }
          const parsedHVCCBox = shaka.util.Mp4BoxParsers.parseHVCC(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedHVCCBox.codec);
          hasVideo = true;
        })
        .box('dvcC', (box) => {
          let codecBase = baseBox || '';
          switch (baseBox) {
            case 'hvc1':
              codecBase = 'dvh1';
              break;
            case 'hev1':
              codecBase = 'dvhe';
              break;
            case 'avc1':
              codecBase = 'dva1';
              break;
            case 'avc3':
              codecBase = 'dvav';
              break;
            case 'av01':
              codecBase = 'dav1';
              break;
          }
          const parsedDVCCBox = shaka.util.Mp4BoxParsers.parseDVCC(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedDVCCBox.codec);
          hasVideo = true;
        })
        .box('dvvC', (box) => {
          let codecBase = baseBox || '';
          switch (baseBox) {
            case 'hvc1':
              codecBase = 'dvh1';
              break;
            case 'hev1':
              codecBase = 'dvhe';
              break;
            case 'avc1':
              codecBase = 'dva1';
              break;
            case 'avc3':
              codecBase = 'dvav';
              break;
            case 'av01':
              codecBase = 'dav1';
              break;
          }
          const parsedDVCCBox = shaka.util.Mp4BoxParsers.parseDVVC(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedDVCCBox.codec);
          hasVideo = true;
        })
        .fullBox('vpcC', (box) => {
          const codecBase = baseBox || '';
          const parsedVPCCBox = shaka.util.Mp4BoxParsers.parseVPCC(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedVPCCBox.codec);
          hasVideo = true;
        })
        .box('av1C', (box) => {
          let codecBase = baseBox || '';
          switch (baseBox) {
            case 'dav1':
              codecBase = 'av01';
              break;
          }
          const parsedAV1CBox = shaka.util.Mp4BoxParsers.parseAV1C(
              codecBase, box.reader, box.name);
          videoCodecs.push(parsedAV1CBox.codec);
          hasVideo = true;
        })

        // This signals an encrypted sample, which we can go inside of to
        // find the codec used.
        // Note: If encrypted, you can only have audio or video, not both.
        .box('enca', Mp4Parser.audioSampleEntry)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('sinf', Mp4Parser.children)
        .box('frma', (box) => {
          const {codec} = shaka.util.Mp4BoxParsers.parseFRMA(box.reader);
          addCodec(codec);
        })

        .box('colr', (box) => {
          videoCodecs = videoCodecs.map((codec) => {
            if (codec.startsWith('av01.')) {
              return shaka.util.Mp4BoxParsers.updateAV1CodecWithCOLRBox(
                  codec, box.reader);
            }
            return codec;
          });
          const {videoRange, colorGamut} =
              shaka.util.Mp4BoxParsers.parseCOLR(box.reader);
          realVideoRange = videoRange;
          realColorGamut = colorGamut;
        })

        .parse(initData || data,
            /* partialOkay= */ true, /* stopOnPartial= */ true);
    if (!audioCodecs.length && !videoCodecs.length) {
      return null;
    }
    const onlyAudio = hasAudio && !hasVideo;
    const closedCaptions = new Map();
    if (hasVideo && !disableText) {
      const captionParser = new shaka.media.ClosedCaptionParser('video/mp4');
      if (initData) {
        captionParser.init(initData);
      }
      try {
        captionParser.parseFrom(data);
        for (const stream of captionParser.getStreams()) {
          closedCaptions.set(stream, stream);
        }
      } catch (e) {
        shaka.log.debug('Error detecting CC streams', e);
      }
      captionParser.reset();
    }
    const codecs = audioCodecs.concat(videoCodecs);
    return {
      type: onlyAudio ? 'audio' : 'video',
      mimeType: onlyAudio ? 'audio/mp4' : 'video/mp4',
      codecs: SegmentUtils.codecsFiltering(codecs).join(', '),
      language: language,
      height: height,
      width: width,
      channelCount: channelCount,
      sampleRate: sampleRate,
      closedCaptions: closedCaptions,
      videoRange: realVideoRange,
      colorGamut: realColorGamut,
      frameRate: realFrameRate,
    };
  }

  /**
   * @param {!Array<string>} codecs
   * @return {!Array<string>} codecs
   */
  static codecsFiltering(codecs) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const SegmentUtils = shaka.media.SegmentUtils;
    const allCodecs = SegmentUtils.filterDuplicateCodecs_(codecs);
    const audioCodecs =
        ManifestParserUtils.guessAllCodecsSafe(ContentType.AUDIO, allCodecs);
    const videoCodecs =
        ManifestParserUtils.guessAllCodecsSafe(ContentType.VIDEO, allCodecs);
    const textCodecs =
        ManifestParserUtils.guessAllCodecsSafe(ContentType.TEXT, allCodecs);
    const validVideoCodecs = SegmentUtils.chooseBetterCodecs_(videoCodecs);
    const finalCodecs =
        audioCodecs.concat(validVideoCodecs).concat(textCodecs);
    if (allCodecs.length && !finalCodecs.length) {
      return allCodecs;
    }
    return finalCodecs;
  }

  /**
   * @param {!Array<string>} codecs
   * @return {!Array<string>} codecs
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

  /**
   * Prioritizes Dolby Vision if supported. This is necessary because with
   * Dolby Vision we could have hvcC and dvcC boxes at the same time.
   *
   * @param {!Array<string>} codecs
   * @return {!Array<string>} codecs
   * @private
   */
  static chooseBetterCodecs_(codecs) {
    if (codecs.length <= 1) {
      return codecs;
    }
    const dolbyVision = codecs.find((codec) => {
      return codec.startsWith('dvav.') ||
          codec.startsWith('dva1.') ||
          codec.startsWith('dvh1.') ||
          codec.startsWith('dvhe.') ||
          codec.startsWith('dav1.') ||
          codec.startsWith('dvc1.') ||
          codec.startsWith('dvi1.');
    });
    if (!dolbyVision) {
      return codecs;
    }
    const type = `video/mp4; codecs="${dolbyVision}"`;
    if (shaka.media.Capabilities.isTypeSupported(type)) {
      return [dolbyVision];
    }
    return codecs.filter((codec) => codec != dolbyVision);
  }

  /**
   * @param {!BufferSource} data
   * @return {?string}
   */
  static getDefaultKID(data) {
    const Mp4Parser = shaka.util.Mp4Parser;

    let defaultKID = null;
    new Mp4Parser()
        .box('moov', Mp4Parser.children)
        .box('trak', Mp4Parser.children)
        .box('mdia', Mp4Parser.children)
        .box('minf', Mp4Parser.children)
        .box('stbl', Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('enca', Mp4Parser.audioSampleEntry)
        .box('sinf', Mp4Parser.children)
        .box('schi', Mp4Parser.children)
        .fullBox('tenc', (box) => {
          const parsedTENCBox = shaka.util.Mp4BoxParsers.parseTENC(box.reader);
          defaultKID = parsedTENCBox.defaultKID;
        })

        .parse(data, /* partialOkay= */ true);
    return defaultKID;
  }

  /**
   * @param {!BufferSource} rawResult
   * @param {shaka.extern.aesKey} aesKey
   * @param {number} position
   * @return {!Promise<!BufferSource>}
   */
  static async aesDecrypt(rawResult, aesKey, position) {
    const key = aesKey;
    if (!key.cryptoKey) {
      goog.asserts.assert(key.fetchKey, 'If AES cryptoKey was not ' +
          'preloaded, fetchKey function should be provided');
      await key.fetchKey();
      goog.asserts.assert(key.cryptoKey, 'AES cryptoKey should now be set');
    }
    let iv = key.iv;
    if (!iv) {
      iv = shaka.util.BufferUtils.toUint8(new ArrayBuffer(16));
      let sequence = key.firstMediaSequenceNumber + position;
      for (let i = iv.byteLength - 1; i >= 0; i--) {
        iv[i] = sequence & 0xff;
        sequence >>= 8;
      }
    }
    let algorithm;
    if (aesKey.blockCipherMode == 'CBC') {
      algorithm = {
        name: 'AES-CBC',
        iv,
      };
    } else {
      algorithm = {
        name: 'AES-CTR',
        counter: iv,
        // NIST SP800-38A standard suggests that the counter should occupy half
        // of the counter block
        length: 64,
      };
    }
    return window.crypto.subtle.decrypt(algorithm, key.cryptoKey, rawResult);
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
 *   closedCaptions: Map<string, string>,
 *   videoRange: ?string,
 *   colorGamut: ?string,
 *   frameRate: ?string,
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
 * @property {Map<string, string>} closedCaptions
 * @property {?string} videoRange
 * @property {?string} colorGamut
 * @property {?string} frameRate
 */
shaka.media.SegmentUtils.BasicInfo;
