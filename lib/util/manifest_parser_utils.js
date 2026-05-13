/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ManifestParserUtils');

goog.require('goog.Uri');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.LanguageUtils');
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
   * @param {string=} keySystemUri
   * @param {!Array<string>=} mediaTypes
   * @return {shaka.extern.DrmInfo}
   */
  static createDrmInfo(
      keySystem,
      encryptionScheme,
      initData,
      keySystemUri = undefined,
      mediaTypes = undefined) {
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
      mediaTypes,
    };

    if (keySystemUri) {
      drmInfo.keySystemUris = new Set([keySystemUri]);
    }

    if (!initData && shaka.drm.DrmUtils.isFairPlayKeySystem(keySystem)) {
      drmInfo.initData.push({
        initDataType: 'sinf',
        initData: new Uint8Array(0),
        keyId: null,
      });
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
   * Parses a CEA-608 accessibility value string and populates the provided
   * closedCaptions map with the channel-to-language assignments found in it.
   *
   * The value string follows the format defined in
   * "urn:scte:dash:cc:cea-608:2015", which is shared by both DASH and MSF.
   *
   * Examples:
   *   "CC1=eng;CC3=spa"   – explicit channel ids with ISO 639-2 language codes
   *   "eng;spa"           – implicit channel ids (CC1 / CC3 for 2 entries,
   *                         CC1 / CC2 / … otherwise)
   *   null / undefined    – defaults to { CC1: 'und' }
   *
   * The map is mutated in place so the caller can accumulate entries from
   * multiple accessibility descriptors before passing it to the stream object.
   *
   * @param {?string} value  The raw value attribute / field, or null.
   * @param {!Map<string, string>} closedCaptions  Map to populate.
   */
  static parseCEA608Captions(value, closedCaptions) {
    if (!value) {
      // No channel / language information – fall back to CC1 / undetermined.
      closedCaptions.set('CC1', 'und');
      return;
    }

    const LanguageUtils = shaka.util.LanguageUtils;
    let channelId = 1;
    const channelAssignments = value.split(';');
    for (const captionStr of channelAssignments) {
      let channel;
      let language;
      if (!captionStr.includes('=')) {
        // Implicit channel assignment.  When there are exactly 2 entries it is
        // highly likely they correspond to CC1 and CC3 (the most commonly used
        // pair).  Otherwise cycle through CC1 – CC4 in order.
        channel = `CC${channelId}`;
        channelId += (channelAssignments.length == 2) ? 2 : 1;
        language = captionStr;
      } else {
        // Explicit assignment: "CC1=eng" or "1=eng".
        const channelAndLanguage = captionStr.split('=');
        // Normalise bare numbers ('1') to full ids ('CC1').
        channel = channelAndLanguage[0].startsWith('CC') ?
            channelAndLanguage[0] : `CC${channelAndLanguage[0]}`;
        // Default to 'und' for blank entries like "CC2=;CC3=" (b/187442669).
        language = channelAndLanguage[1] || 'und';
      }
      closedCaptions.set(channel, LanguageUtils.normalize(language));
    }
  }


  /**
   * Parses a CEA-708 accessibility value string and populates the provided
   * closedCaptions map with the service-to-language assignments found in it.
   *
   * The value string follows the format defined in
   * "urn:scte:dash:cc:cea-708:2015", which is shared by both DASH and MSF.
   *
   * Examples:
   *   "1=lang:eng;2=lang:deu"         – explicit service numbers with language
   *   "1=lang:eng,war:1;2=lang:deu"   – extra parameters after the language
   *                                      are silently ignored
   *   "eng;deu;swe"                   – implicit service numbers (svc1, svc2 …)
   *   null / undefined                – defaults to { svc1: 'und' }
   *
   * The map is mutated in place so the caller can accumulate entries from
   * multiple accessibility descriptors before passing it to the stream object.
   *
   * @param {?string} value  The raw value attribute / field, or null.
   * @param {!Map<string, string>} closedCaptions  Map to populate.
   */
  static parseCEA708Captions(value, closedCaptions) {
    if (!value) {
      // No service / language information – fall back to svc1 / undetermined.
      closedCaptions.set('svc1', 'und');
      return;
    }

    const LanguageUtils = shaka.util.LanguageUtils;
    let serviceNumber = 1;
    for (const captionStr of value.split(';')) {
      let service;
      let language;
      if (!captionStr.includes('=')) {
        // Implicit service number: "eng;deu;swe".
        service = `svc${serviceNumber}`;
        serviceNumber++;
        language = captionStr;
      } else {
        // Explicit assignment: "1=lang:eng" or "1=lang:eng,war:1,er:1".
        const serviceAndLanguage = captionStr.split('=');
        service = `svc${serviceAndLanguage[0]}`;
        // Extract the language code, ignoring any extra comma-separated params.
        language = serviceAndLanguage[1].split(',')[0].split(':').pop();
      }
      closedCaptions.set(service, LanguageUtils.normalize(language));
    }
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
  CHAPTER: 'chapter',
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
 */
shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS = [
  /^avc/,
  /^hev/,
  /^hvc/,
  /^vvc/,
  /^vvi/,
  /^vp0?[89]/,
  /^av01/,
  /^mp2v/,
  /^dvh/, // Dolby Vision based in HEVC
  /^dva/, // Dolby Vision based in AVC
  /^dav/, // Dolby Vision based in AV1
];


/**
 * A list of regexps to detect well-known audio codecs.
 *
 * @const {!Array<!RegExp>}
 */
shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS = [
  /^vorbis$/,
  /^Opus$/, // correct codec string according to RFC 6381 section 3.3
  /^opus$/, // some manifests wrongfully use this
  /^fLaC$/, // correct codec string according to RFC 6381 section 3.3
  /^flac$/, // some manifests wrongfully use this
  /^mp4a/,
  /^[ae]c-3$/,
  /^ac-4/,
  // DTS variants: dts, dtsc, dtse, dtsh, dtsx
  /^dts[cehx]?$/,
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
 */
shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS = [
  /^vtt$/,
  /^wvtt/,
  /^stpp/,
];


/**
 * @const {!Map<string, !Array<!RegExp>>}
 */
shaka.util.ManifestParserUtils.CODEC_REGEXPS_BY_CONTENT_TYPE_ = new Map()
    .set('audio', shaka.util.ManifestParserUtils.AUDIO_CODEC_REGEXPS)
    .set('video', shaka.util.ManifestParserUtils.VIDEO_CODEC_REGEXPS)
    .set('text', shaka.util.ManifestParserUtils.TEXT_CODEC_REGEXPS);
