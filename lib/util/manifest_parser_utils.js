/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ManifestParserUtils');

goog.require('goog.Uri');
goog.require('shaka.util.Error');


/**
 * @summary Utility functions for manifest parsing.
 */
shaka.util.ManifestParserUtils = class {
  /**
   * Resolves an array of relative URIs to the given base URIs. This will result
   * in M*N number of URIs.
   *
   * Note: This method is slow in SmartTVs and Consoles. It should only be
   * called when necessary.
   *
   * @param {!Array.<string>} baseUris
   * @param {!Array.<string>} relativeUris
   * @return {!Array.<string>}
   */
  static resolveUris(baseUris, relativeUris) {
    if (relativeUris.length == 0) {
      return baseUris;
    }

    if (baseUris.length == 1 && relativeUris.length == 1) {
      const baseUri = new goog.Uri(baseUris[0]);
      const relativeUri = new goog.Uri(relativeUris[0]);
      return [baseUri.resolve(relativeUri).toString()];
    }

    const relativeAsGoog = relativeUris.map((uri) => new goog.Uri(uri));

    // For each base URI, this code resolves it with every relative URI.
    // The result is a single array containing all the resolved URIs.
    const resolvedUris = [];
    for (const baseStr of baseUris) {
      const base = new goog.Uri(baseStr);
      for (const relative of relativeAsGoog) {
        resolvedUris.push(base.resolve(relative).toString());
      }
    }

    return resolvedUris;
  }


  /**
   * Creates a DrmInfo object from the given info.
   *
   * @param {string} keySystem
   * @param {Array.<shaka.extern.InitDataOverride>} initData
   * @return {shaka.extern.DrmInfo}
   */
  static createDrmInfo(keySystem, initData) {
    return {
      keySystem: keySystem,
      licenseServerUri: '',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      serverCertificateUri: '',
      sessionType: '',
      initData: initData || [],
      keyIds: new Set(),
    };
  }


  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content type.
   * Assumes that at least one codec is correct, and throws if none are.
   *
   * @param {string} contentType
   * @param {!Array.<string>} codecs
   * @return {string}
   */
  static guessCodecs(contentType, codecs) {
    if (codecs.length == 1) {
      return codecs[0];
    }

    const match = shaka.util.ManifestParserUtils.guessCodecsSafe(
        contentType, codecs);
    // A failure is specifically denoted by null; an empty string represents a
    // valid match of no codec.
    if (match != null) {
      return match;
    }

    // Unable to guess codecs.
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.HLS_COULD_NOT_GUESS_CODECS,
        codecs);
  }


  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content type. Does not assume a single codec is anything special, and does
   * not throw if it fails to match.
   *
   * @param {string} contentType
   * @param {!Array.<string>} codecs
   * @return {?string} or null if no match is found
   */
  static guessCodecsSafe(contentType, codecs) {
    const formats = shaka.util.ManifestParserUtils
        .CODEC_REGEXPS_BY_CONTENT_TYPE_[contentType];
    for (const format of formats) {
      for (const codec of codecs) {
        if (format.test(codec.trim())) {
          return codec.trim();
        }
      }
    }

    // Text does not require a codec string.
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      return '';
    }

    return null;
  }
};


/**
 * @enum {string}
 */
shaka.util.ManifestParserUtils.ContentType = {
  VIDEO: 'video',
  AUDIO: 'audio',
  TEXT: 'text',
  IMAGE: 'image',
  APPLICATION: 'application',
};


/**
 * @enum {string}
 */
shaka.util.ManifestParserUtils.TextStreamKind = {
  SUBTITLE: 'subtitle',
  CLOSED_CAPTION: 'caption',
};


/**
 * Specifies how tolerant the player is of inaccurate segment start times and
 * end times within a manifest. For example, gaps or overlaps between segments
 * in a SegmentTimeline which are greater than or equal to this value will
 * result in a warning message.
 *
 * @const {number}
 */
shaka.util.ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS = 1 / 15;


/**
 * A list of regexps to detect well-known video codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS_ = [
  /^avc/,
  /^hev/,
  /^hvc/,
  /^vp0?[89]/,
  /^av01/,
  /^dvh/,
];


/**
 * A list of regexps to detect well-known audio codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS_ = [
  /^vorbis$/,
  /^Opus$/, // correct codec string according to RFC 6381 section 3.3
  /^opus$/, // some manifests wrongfully use this
  /^fLaC$/, // correct codec string according to RFC 6381 section 3.3
  /^flac$/, // some manifests wrongfully use this
  /^mp4a/,
  /^[ae]c-3$/,
  /^ac-4$/,
  /^dts[cex]$/, // DTS Digital Surround (dtsc), DTS Express (dtse), DTS:X (dtsx)
];


/**
 * A list of regexps to detect well-known text codecs.
 *
 * @const {!Array.<!RegExp>}
 * @private
 */
shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS_ = [
  /^vtt$/,
  /^wvtt/,
  /^stpp/,
];


/**
 * @const {!Object.<string, !Array.<!RegExp>>}
 */
shaka.util.ManifestParserUtils.CODEC_REGEXPS_BY_CONTENT_TYPE_ = {
  'audio': shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS_,
  'video': shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS_,
  'text': shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS_,
};
