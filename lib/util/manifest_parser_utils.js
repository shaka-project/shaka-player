/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ManifestParserUtils');

goog.require('goog.Uri');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


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
   * @param {!Array<string>} baseUris
   * @param {!Array<string>} relativeUris
   * @param {string=} extraQueryParams
   * @return {!Array<string>}
   */
  static resolveUris(baseUris, relativeUris, extraQueryParams = '') {
    if (relativeUris.length == 0) {
      return baseUris;
    }

    if (baseUris.length == 1 && relativeUris.length == 1) {
      const baseUri = new goog.Uri(baseUris[0]);
      const relativeUri = new goog.Uri(relativeUris[0]);
      const resolvedUri = baseUri.resolve(relativeUri);
      if (extraQueryParams) {
        resolvedUri.setQueryData(extraQueryParams);
      }
      return [resolvedUri.toString()];
    }

    const relativeAsGoog = relativeUris.map((uri) => new goog.Uri(uri));

    // For each base URI, this code resolves it with every relative URI.
    // The result is a single array containing all the resolved URIs.
    const resolvedUris = [];
    for (const baseStr of baseUris) {
      const base = new goog.Uri(baseStr);
      for (const relative of relativeAsGoog) {
        const resolvedUri = base.resolve(relative);
        if (extraQueryParams) {
          resolvedUri.setQueryData(extraQueryParams);
        }
        resolvedUris.push(resolvedUri.toString());
      }
    }

    return resolvedUris;
  }


  /**
   * Creates a DrmInfo object from the given info.
   *
   * @param {string} keySystem
   * @param {string} encryptionScheme
   * @param {Array<shaka.extern.InitDataOverride>} initData
   * @param {string} [keySystemUri]
   * @return {shaka.extern.DrmInfo}
   */
  static createDrmInfo(keySystem, encryptionScheme, initData, keySystemUri) {
    const drmInfo = {
      keySystem,
      encryptionScheme,
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

    if (keySystemUri) {
      drmInfo.keySystemUris = new Set([keySystemUri]);
    }

    return drmInfo;
  }

  /**
   * Creates a DrmInfo object from ClearKeys.
   *
   * @param {!Map<string, string>} clearKeys
   * @param {string=} encryptionScheme
   * @return {shaka.extern.DrmInfo}
   */
  static createDrmInfoFromClearKeys(clearKeys, encryptionScheme = 'cenc') {
    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
    const keys = [];
    const keyIds = [];
    const originalKeyIds = [];

    clearKeys.forEach((key, keyId) => {
      let kid = keyId;
      if (kid.length != 22) {
        kid = Uint8ArrayUtils.toBase64(
            Uint8ArrayUtils.fromHex(keyId), false);
      }
      let k = key;
      if (k.length != 22) {
        k = Uint8ArrayUtils.toBase64(
            Uint8ArrayUtils.fromHex(key), false);
      }
      const keyObj = {
        kty: 'oct',
        kid: kid,
        k: k,
      };

      keys.push(keyObj);
      keyIds.push(keyObj.kid);
      originalKeyIds.push(keyId);
    });

    const jwkSet = {keys: keys};
    const license = JSON.stringify(jwkSet);

    // Use the keyids init data since is suggested by EME.
    // Suggestion: https://bit.ly/2JYcNTu
    // Format: https://www.w3.org/TR/eme-initdata-keyids/
    const initDataStr = JSON.stringify({'kids': keyIds});
    const initData =
        shaka.util.BufferUtils.toUint8(StringUtils.toUTF8(initDataStr));
    const initDatas = [{initData: initData, initDataType: 'keyids'}];

    return {
      keySystem: 'org.w3.clearkey',
      encryptionScheme,
      licenseServerUri: 'data:application/json;base64,' + window.btoa(license),
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      audioRobustness: '',
      videoRobustness: '',
      serverCertificate: null,
      serverCertificateUri: '',
      sessionType: '',
      initData: initDatas,
      keyIds: new Set(originalKeyIds),
    };
  }


  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content type.
   * Assumes that at least one codec is correct, and throws if none are.
   *
   * @param {string} contentType
   * @param {!Array<string>} codecs
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
   * @param {!Array<string>} codecs
   * @return {?string} or null if no match is found
   */
  static guessCodecsSafe(contentType, codecs) {
    const formats = shaka.util.ManifestParserUtils
        .CODEC_REGEXPS_BY_CONTENT_TYPE_.get(contentType);
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


  /**
   * Attempts to guess which codecs from the codecs list belong to a given
   * content.
   *
   * @param {string} contentType
   * @param {!Array<string>} codecs
   * @return {!Array<string>}
   */
  static guessAllCodecsSafe(contentType, codecs) {
    const allCodecs = [];
    const formats = shaka.util.ManifestParserUtils
        .CODEC_REGEXPS_BY_CONTENT_TYPE_.get(contentType);
    for (const format of formats) {
      for (const codec of codecs) {
        if (format.test(codec.trim())) {
          allCodecs.push(codec.trim());
        }
      }
    }

    return allCodecs;
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
 * @const {!Array<!RegExp>}
 * @private
 */
shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS_ = [
  /^avc/,
  /^hev/,
  /^hvc/,
  /^vvc/,
  /^vvi/,
  /^vp0?[89]/,
  /^av01/,
  /^dvh/, // Dolby Vision based in HEVC
  /^dva/, // Dolby Vision based in AVC
  /^dav/, // Dolby Vision based in AV1
];


/**
 * A list of regexps to detect well-known audio codecs.
 *
 * @const {!Array<!RegExp>}
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
  /^ac-4/,
  /^dts[cex]$/, // DTS Digital Surround (dtsc), DTS Express (dtse), DTS:X (dtsx)
  /^iamf/,
  /^mhm[12]/, // MPEG-H Audio LC
  /^ac3$/, // sometimes ac3 is used instead of ac-3
  /^eac3$/, // sometimes "eac3" is used instead of "ec-3"
  /^apac$/,
];


/**
 * A list of regexps to detect well-known text codecs.
 *
 * @const {!Array<!RegExp>}
 * @private
 */
shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS_ = [
  /^vtt$/,
  /^wvtt/,
  /^stpp/,
];


/**
 * @const {!Map<string, !Array<!RegExp>>}
 */
shaka.util.ManifestParserUtils.CODEC_REGEXPS_BY_CONTENT_TYPE_ = new Map()
    .set('audio', shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS_)
    .set('video', shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS_)
    .set('text', shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS_);
