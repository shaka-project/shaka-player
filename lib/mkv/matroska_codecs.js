/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.mkv.MatroskaCodecs');

goog.require('shaka.codec.AAC');
goog.require('shaka.codec.AV1');
goog.require('shaka.codec.DolbyVision');
goog.require('shaka.codec.Flac');
goog.require('shaka.codec.H264');
goog.require('shaka.codec.H265');
goog.require('shaka.codec.Opus');
goog.require('shaka.codec.VP9');
goog.require('shaka.media.Capabilities');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.TrackType');
goog.require('shaka.util.ManifestParserUtils');
goog.requireType('shaka.mkv.MatroskaIndexParser');


/**
 * The codecs a Matroska track can carry that a browser can play without
 * transcoding, and the conversions from what Matroska stores to what MP4 or
 * WebM (and MSE) expect.
 */
shaka.mkv.MatroskaCodecs = class {
  /**
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {?string} The content type of the track, or null when the track is
   *   not one the Player can use.
   */
  static getContentType(track) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    switch (track.type) {
      case shaka.mkv.TrackType.VIDEO:
        return ContentType.VIDEO;
      case shaka.mkv.TrackType.AUDIO:
        return ContentType.AUDIO;
      case shaka.mkv.TrackType.SUBTITLE:
        return ContentType.TEXT;
    }
    return null;
  }

  /**
   * Gets the RFC 6381 codec string of a track.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {?string} The codec string, or null when the codec is not
   *   supported: either the browsers cannot play it (DTS...) or the track is
   *   compressed or encrypted.
   */
  static getCodecs(track) {
    const CodecId = shaka.mkv.CodecId;
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    if (track.unsupportedEncoding) {
      return null;
    }
    // The blocks of a WebM track are not rewritten, and there is nowhere to
    // put the stripped header back.
    if (track.strippedHeader && MatroskaCodecs.usesWebm(track.codecId)) {
      return null;
    }
    const config = track.codecPrivate;
    switch (track.codecId) {
      case CodecId.AVC:
        return config && config.length >= MatroskaCodecs.AVCC_MIN_SIZE_ ?
            MatroskaCodecs.orDolbyVision_(
                track, shaka.codec.H264.getCodecs(config)) : null;
      case CodecId.HEVC:
        return config && config.length >= MatroskaCodecs.HVCC_MIN_SIZE_ ?
            MatroskaCodecs.orDolbyVision_(
                track, shaka.codec.H265.getCodecs(config)) : null;
      case CodecId.AV1:
        return config && config.length >= MatroskaCodecs.AV1C_MIN_SIZE_ ?
            MatroskaCodecs.orDolbyVision_(
                track, shaka.codec.AV1.getCodecs(config)) : null;
      case CodecId.VP9:
        return MatroskaCodecs.getVp9Codecs_(track);
      case CodecId.VP8:
        return 'vp8';
      case CodecId.AAC:
        return config && config.length ? shaka.codec.AAC.getCodecs(
            config, track.sampleRate, track.outputSampleRate) : null;
      case CodecId.AC3:
        return 'ac-3';
      case CodecId.EAC3:
        return 'ec-3';
      case CodecId.OPUS:
        return 'opus';
      case CodecId.MP3:
        return 'mp3';
      case CodecId.FLAC:
        return config && shaka.codec.Flac.parseStreamInfo(config) ?
            'flac' : null;
      case CodecId.VORBIS:
        // The decoder is configured by the three headers of CodecPrivate.
        return config && config.length ? 'vorbis' : null;
      case CodecId.SRT:
      case CodecId.ASCII:
        return MatroskaCodecs.SRT_CODEC;
      case CodecId.ASS:
      case CodecId.SSA:
        // The styles are in the header, which is CodecPrivate.
        return config && config.length ? MatroskaCodecs.ASS_CODEC : null;
    }
    return null;
  }

  /**
   * Tells whether the browsers take a codec in WebM, and not in MP4.  VP8 and
   * Vorbis exist in MP4 in theory, but no browser plays them from there.
   *
   * @param {string} codecId
   * @return {boolean}
   */
  static usesWebm(codecId) {
    return codecId == shaka.mkv.CodecId.VP8 ||
        codecId == shaka.mkv.CodecId.VORBIS;
  }

  /**
   * MP3 is accepted as raw MPEG audio on some platforms and in MP4 on others.
   * @param {string} codecId
   * @return {boolean}
   */
  static usesRawMpegAudio(codecId) {
    return codecId == shaka.mkv.CodecId.MP3 &&
        !shaka.media.Capabilities.isTypeSupported('audio/mp4; codecs="mp3"') &&
        shaka.media.Capabilities.isTypeSupported('audio/mpeg');
  }

  /**
   * The name of the sample entry (and of the codec, in the codec string) that
   * MP4 uses for a Matroska video codec.
   *
   * @param {string} codecId
   * @return {string}
   */
  static getMp4VideoCodec(codecId) {
    const CodecId = shaka.mkv.CodecId;
    switch (codecId) {
      case CodecId.AVC:
        return 'avc1';
      case CodecId.HEVC:
        return 'hvc1';
      case CodecId.AV1:
        return 'av01';
      case CodecId.VP9:
        return 'vp09';
    }
    return '';
  }

  /**
   * Gets the payload of the codec configuration box (avcC, hvcC, av1C or
   * vpcC) of a video track.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @param {string} codecs The codec string of the stream.
   * @return {!Uint8Array}
   */
  static getVideoConfig(track, codecs) {
    if (track.codecId == shaka.mkv.CodecId.VP9) {
      return shaka.codec.VP9.buildVpcC(codecs);
    }
    // For AVC, HEVC and AV1 the CodecPrivate of Matroska is defined as the
    // very content of the configuration box that MP4 has.
    return track.codecPrivate || new Uint8Array(0);
  }

  /**
   * Gets the dOps box payload of an Opus track.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {!Uint8Array}
   */
  static getOpusConfig(track) {
    const Opus = shaka.codec.Opus;
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    let head = track.codecPrivate;
    if (!head || head.length < MatroskaCodecs.OPUS_HEAD_MIN_SIZE_) {
      // Make up the head of a plain stereo/mono stream.
      head = Opus.makeHead(track.channels || 2,
          Math.round((track.codecDelay || 0) * Opus.SAMPLE_RATE));
    }
    return Opus.getDops(head);
  }

  /**
   * Gets the pixel aspect ratio of a video track.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {?{horizontal: number, vertical: number}} The ratio reduced to its
   *   lowest terms, or null when the pixels are square (or unknown).
   */
  static getPixelAspectRatio(track) {
    const {width, height, displayWidth, displayHeight} = track;
    if (!width || !height || !displayWidth || !displayHeight) {
      return null;
    }
    const horizontal = displayWidth * height;
    const vertical = displayHeight * width;
    if (horizontal == vertical) {
      return null;
    }
    let a = horizontal;
    let b = vertical;
    while (b) {
      [a, b] = [b, a % b];
    }
    return {horizontal: horizontal / a, vertical: vertical / a};
  }

  /**
   * Gets the frame rate of a video track from its DefaultDuration, which is a
   * whole number of nanoseconds and so gives a rate that is not quite the one
   * that was meant (a duration of 41666666 ns is 24.00000038 fps).  A rate
   * that is within rounding of a whole number, or of a whole number times
   * 1000/1001 (23.976, 29.97, 59.94), is taken as it.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {(number|undefined)}
   */
  static getFrameRate(track) {
    if (!track.defaultDuration) {
      return undefined;
    }
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    const rate = 1 / track.defaultDuration;
    const tolerance = rate * MatroskaCodecs.FRAME_RATE_TOLERANCE_;
    const whole = Math.round(rate);
    if (whole > 0 && Math.abs(rate - whole) <= tolerance) {
      return whole;
    }
    // NTSC rates are whole numbers of frames a second slowed down by 1000/1001.
    const ntsc = Math.round(rate * 1.001) * 1000 / 1001;
    if (ntsc > 0 && Math.abs(rate - ntsc) <= tolerance) {
      return ntsc;
    }
    return rate;
  }

  /**
   * Gets the HDR transfer function of a video track, in the vocabulary of
   * shaka.extern.Stream.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {(string|undefined)}
   */
  static getHdr(track) {
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    switch (track.transferCharacteristics) {
      case MatroskaCodecs.TRANSFER_PQ_:
        return 'PQ';
      case MatroskaCodecs.TRANSFER_HLG_:
        return 'HLG';
    }
    // Dolby Vision streams do not always say it in the colour: the base layer
    // tells (HDR10, or HLG); profile 5 has no base layer.
    const config = track.dolbyVisionConfig &&
        shaka.codec.DolbyVision.parseConfig(track.dolbyVisionConfig);
    if (config) {
      return config.blSignalCompatibilityId ==
          MatroskaCodecs.DOLBY_VISION_HLG_COMPATIBILITY_ ? 'HLG' : 'PQ';
    }
    return undefined;
  }

  /**
   * Gets the codec string of the Dolby Vision version of a track, when it
   * should be offered next to the codec of the track: the base layer plays on
   * its own as HDR10, SDR or HLG (profiles 8 and 10), so the platforms that do
   * not decode Dolby Vision keep the plain stream.  This is what HLS calls
   * SUPPLEMENTAL-CODECS.
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {string} The codec string, or an empty string if the track has no
   *   such version.
   */
  static getSupplementalCodecs(track) {
    const dolbyVision = shaka.mkv.MatroskaCodecs.getDolbyVision_(track);
    return dolbyVision && dolbyVision.hasCompatibleBase ?
        dolbyVision.codecs : '';
  }

  /**
   * Gets the number of the track a stream is made from.  The second stream of
   * a track has an identifier that is made from the number; see
   * MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET.
   *
   * @param {number} streamId
   * @return {number}
   */
  static getTrackNumber(streamId) {
    return streamId %
        shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET;
  }

  /**
   * The codec of a track, or its Dolby Vision version when the plain codec is
   * of no use without it (profile 5).
   *
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @param {string} baseCodecs
   * @return {string}
   * @private
   */
  static orDolbyVision_(track, baseCodecs) {
    const dolbyVision = shaka.mkv.MatroskaCodecs.getDolbyVision_(track);
    return dolbyVision && !dolbyVision.hasCompatibleBase ?
        dolbyVision.codecs : baseCodecs;
  }

  /**
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {?{codecs: string, hasCompatibleBase: boolean}}
   * @private
   */
  static getDolbyVision_(track) {
    const CodecId = shaka.mkv.CodecId;
    const DolbyVision = shaka.codec.DolbyVision;
    const config = track.dolbyVisionConfig &&
        DolbyVision.parseConfig(track.dolbyVisionConfig);
    // A stream with an enhancement layer (profile 7) needs a decoder of both.
    // Its base layer is a stream of the plain codec.
    if (!config || config.elPresent) {
      return null;
    }
    let entryName = null;
    switch (track.codecId) {
      case CodecId.AVC:
        entryName = 'dva1';
        break;
      case CodecId.HEVC:
        entryName = 'dvh1';
        break;
      case CodecId.AV1:
        entryName = 'dav1';
        break;
    }
    if (!entryName) {
      return null;
    }
    return {
      codecs: DolbyVision.getCodecs(entryName, config),
      hasCompatibleBase: DolbyVision.hasCompatibleBase(config),
    };
  }

  /**
   * @param {!shaka.mkv.MatroskaIndexParser.Track} track
   * @return {string}
   * @private
   */
  static getVp9Codecs_(track) {
    const VP9 = shaka.codec.VP9;
    const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
    const info = {profile: 0, bitDepth: 8, chroma: VP9.CHROMA_420_COLOCATED};
    // A track may describe itself in CodecPrivate as a list of
    // (id, length, value) features.  Otherwise the values are provisional
    // until the first key frame is read; see VP9.parseKeyFrame().
    const config = track.codecPrivate;
    if (config) {
      for (let i = 0; i + 2 < config.length; i += 2 + config[i + 1]) {
        const value = config[i + 2];
        switch (config[i]) {
          case MatroskaCodecs.VP9_FEATURE_PROFILE_:
            info.profile = value;
            break;
          case MatroskaCodecs.VP9_FEATURE_BIT_DEPTH_:
            info.bitDepth = value;
            break;
          case MatroskaCodecs.VP9_FEATURE_CHROMA_:
            info.chroma = value;
            break;
        }
      }
    }
    return VP9.getCodecs(info, track.width || 0, track.height || 0,
        track.defaultDuration);
  }
};


/**
 * The codec string of SRT text, which has no codec registered in RFC 6381.
 * @const {string}
 */
shaka.mkv.MatroskaCodecs.SRT_CODEC = 'srt';

/**
 * The codec string of SSA and ASS text, which has no codec registered either.
 * @const {string}
 */
shaka.mkv.MatroskaCodecs.ASS_CODEC = 'ass';

/**
 * Minimum size of avcC: version, profile, compatibility, level, and the NAL
 * length size; the codec string is made of bytes 1 to 3.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.AVCC_MIN_SIZE_ = 4;

/**
 * Minimum size of hvcC up to (and including) general_level_idc, which is where
 * the codec string stops reading.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.HVCC_MIN_SIZE_ = 13;

/**
 * Size of the fixed part of av1C.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.AV1C_MIN_SIZE_ = 4;

/**
 * The size of an OpusHead without a channel mapping table.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.OPUS_HEAD_MIN_SIZE_ = 19;

/**
 * How far a frame rate can be, as a fraction of it, from a rate of a frame
 * duration that has been rounded to a nanosecond and still be taken for it.
 * The rounding is at most 0.5 ns of durations of tens of milliseconds, so this
 * (0.001%) is far more than it needs and far less than the difference between
 * two rates that exist.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.FRAME_RATE_TOLERANCE_ = 0.00001;

/**
 * H.273 code points of the transfer characteristics: SMPTE ST 2084 (PQ) and
 * ARIB STD-B67 (HLG).
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.TRANSFER_PQ_ = 16;

/** @private @const {number} */
shaka.mkv.MatroskaCodecs.TRANSFER_HLG_ = 18;

/**
 * The value of bl_signal_compatibility_id of a Dolby Vision stream whose base
 * layer is HLG.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.DOLBY_VISION_HLG_COMPATIBILITY_ = 4;

/**
 * Feature ids of the CodecPrivate of a VP9 track.
 * @private @const {number}
 */
shaka.mkv.MatroskaCodecs.VP9_FEATURE_PROFILE_ = 1;

/** @private @const {number} */
shaka.mkv.MatroskaCodecs.VP9_FEATURE_BIT_DEPTH_ = 3;

/** @private @const {number} */
shaka.mkv.MatroskaCodecs.VP9_FEATURE_CHROMA_ = 4;
