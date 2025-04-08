/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MimeUtils');

goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.ManifestParserUtils');

/**
 * @summary A set of utility functions for dealing with MIME types.
 * @export
 */
shaka.util.MimeUtils = class {
  /**
   * Takes a MIME type and optional codecs string and produces the full MIME
   * type. Also remove the codecs for raw formats.
   *
   * @param {string} mimeType
   * @param {string=} codecs
   * @return {string}
   * @export
   */
  static getFullType(mimeType, codecs) {
    let fullMimeType = mimeType;
    if (codecs && !shaka.util.MimeUtils.RAW_FORMATS.includes(mimeType)) {
      fullMimeType += '; codecs="' + codecs + '"';
    }
    return fullMimeType;
  }

  /**
   * Takes a MIME type and optional codecs string and produces the full MIME
   * type.
   *
   * @param {string} mimeType
   * @param {string=} codecs
   * @return {string}
   * @export
   */
  static getFullTypeWithAllCodecs(mimeType, codecs) {
    let fullMimeType = mimeType;
    if (codecs) {
      fullMimeType += '; codecs="' + codecs + '"';
    }
    return fullMimeType;
  }

  /**
   * Takes a MIME type and a codecs string and produces the full MIME
   * type. If it's a transport stream, convert its codecs to MP4 codecs.
   * Otherwise for multiplexed content, convert the video MIME types to
   * their audio equivalents if the content type is audio.
   *
   * @param {string} mimeType
   * @param {string} codecs
   * @param {string} contentType
   * @return {string}
   */
  static getFullOrConvertedType(mimeType, codecs, contentType) {
    const MimeUtils = shaka.util.MimeUtils;
    const fullMimeType = MimeUtils.getFullType(mimeType, codecs);
    const fullMimeTypeWithAllCodecs = MimeUtils.getFullTypeWithAllCodecs(
        mimeType, codecs);
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;

    if (TransmuxerEngine.isSupported(fullMimeTypeWithAllCodecs, contentType)) {
      return TransmuxerEngine.convertCodecs(
          contentType, fullMimeTypeWithAllCodecs);
    } else if (mimeType != 'video/mp2t' && contentType == ContentType.AUDIO) {
      // video/mp2t is the correct mime type for TS audio, so only replace the
      // word "video" with "audio" for non-TS audio content.
      return fullMimeType.replace('video', 'audio');
    }
    return fullMimeType;
  }


  /**
   * Takes a Stream object and produces an extended MIME type with information
   * beyond the container and codec type, when available.
   *
   * @param {shaka.extern.Stream} stream
   * @param {string} mimeType
   * @param {string} codecs
   * @return {string}
   */
  static getExtendedType(stream, mimeType, codecs) {
    const components = [mimeType];

    const extendedMimeParams = shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_;
    extendedMimeParams.forEach((mimeKey, streamKey) => {
      const value = stream[streamKey];
      if (streamKey == 'codecs') {
        if (shaka.util.MimeUtils.RAW_FORMATS.includes(stream.mimeType)) {
          // Skip codecs for raw formats
        } else {
          components.push('codecs="' + codecs + '"');
        }
      } else if (value) {
        components.push(mimeKey + '="' + value + '"');
      }
    });
    if (stream.hdr == 'PQ') {
      components.push('eotf="smpte2084"');
    }

    return components.join(';');
  }

  /**
   * Takes a full MIME type (with codecs) or basic MIME type (without codecs)
   * and returns a container type string ("mp2t", "mp4", "webm", etc.)
   *
   * @param {string} mimeType
   * @return {string}
   */
  static getContainerType(mimeType) {
    return mimeType.split(';')[0].split('/')[1];
  }

  /**
   * Split a list of codecs encoded in a string into a list of codecs.
   * @param {string} codecs
   * @return {!Array<string>}
   */
  static splitCodecs(codecs) {
    return codecs.split(',');
  }

  /**
   * Get the normalized codec from a codec string,
   * independently of their container.
   *
   * @param {string} codecString
   * @return {string}
   */
  static getNormalizedCodec(codecString) {
    const parts =
      shaka.util.MimeUtils.getCodecParts_(codecString);
    const base = parts[0].toLowerCase();
    const profile = parts[1].toLowerCase();
    switch (true) {
      case base === 'mp4a' && profile === '69':
      case base === 'mp4a' && profile === '6b':
      case base === 'mp4a' && profile === '40.34':
        return 'mp3';
      case base === 'mp4a' && profile === '66':
      case base === 'mp4a' && profile === '67':
      case base === 'mp4a' && profile === '68':
      case base === 'mp4a' && profile === '40.2':
      case base === 'mp4a' && profile === '40.02':
      case base === 'mp4a' && profile === '40.5':
      case base === 'mp4a' && profile === '40.05':
      case base === 'mp4a' && profile === '40.29':
      case base === 'mp4a' && profile === '40.42': // Extended HE-AAC
        return 'aac';
      case base === 'mp4a' && profile === 'a5':
      case base === 'ac3':
      case base === 'ac-3':
        return 'ac-3'; // Dolby Digital
      case base === 'mp4a' && profile === 'a6':
      case base === 'eac3':
      case base === 'ec-3':
        return 'ec-3'; // Dolby Digital Plus
      case base === 'ac-4':
        return 'ac-4'; // Dolby AC-4
      case base === 'mp4a' && profile === 'b2':
        return 'dtsx'; // DTS:X
      case base === 'mp4a' && profile === 'a9':
        return 'dtsc'; // DTS Digital Surround
      case base === 'vp09':
      case base === 'vp9':
        return 'vp9';
      case base === 'avc1':
      case base === 'avc3':
        return 'avc'; // H264
      case base === 'hvc1':
      case base === 'hev1':
        return 'hevc'; // H265
      case base === 'vvc1':
      case base === 'vvi1':
        return 'vvc'; // H266
      case base === 'dvh1':
      case base === 'dvhe':
        if (profile && profile.startsWith('05')) {
          return 'dovi-p5'; // Dolby Vision profile 5
        }
        return 'dovi-hevc'; // Dolby Vision based in HEVC
      case base === 'dvav':
      case base === 'dva1':
        return 'dovi-avc'; // Dolby Vision based in AVC
      case base === 'dav1':
        return 'dovi-av1'; // Dolby Vision based in AV1
      case base === 'dvc1':
      case base === 'dvi1':
        return 'dovi-vvc'; // Dolby Vision based in VVC
    }
    return base;
  }

  /**
   * Get the base codec from a codec string.
   *
   * @param {string} codecString
   * @return {string}
   */
  static getCodecBase(codecString) {
    const codecsBase = [];
    for (const codec of codecString.split(',')) {
      const parts = shaka.util.MimeUtils.getCodecParts_(codec);
      codecsBase.push(parts[0]);
    }
    return codecsBase.sort().join(',');
  }

  /**
   * Takes a full MIME type (with codecs) or basic MIME type (without codecs)
   * and returns a basic MIME type (without codecs or other parameters).
   *
   * @param {string} mimeType
   * @return {string}
   */
  static getBasicType(mimeType) {
    return mimeType.split(';')[0];
  }

  /**
   * Takes a MIME type and returns the codecs parameter, or an empty string if
   * there is no codecs parameter.
   *
   * @param {string} mimeType
   * @return {string}
   */
  static getCodecs(mimeType) {
    // Parse the basic MIME type from its parameters.
    const pieces = mimeType.split(/ *; */);
    pieces.shift();  // Remove basic MIME type from pieces.

    const codecs = pieces.find((piece) => piece.startsWith('codecs='));
    if (!codecs) {
      return '';
    }

    // The value may be quoted, so remove quotes at the beginning or end.
    const value = codecs.split('=')[1].replace(/^"|"$/g, '');
    return value;
  }

  /**
   * Checks if the given MIME type is HLS MIME type.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  static isHlsType(mimeType) {
    return mimeType === 'application/x-mpegurl' ||
        mimeType === 'application/vnd.apple.mpegurl';
  }

  /**
   * Checks if the given MIME type is DASH MIME type.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  static isDashType(mimeType) {
    return mimeType === 'application/dash+xml' ||
        mimeType === 'video/vnd.mpeg.dash.mpd';
  }

  /**
   * Get the base and profile of a codec string. Where [0] will be the codec
   * base and [1] will be the profile.
   * @param {string} codecString
   * @return {!Array<string>}
   * @private
   */
  static getCodecParts_(codecString) {
    const parts = codecString.split('.');

    const base = parts[0];

    parts.shift();
    const profile = parts.join('.');

    // Make sure that we always return a "base" and "profile".
    return [base, profile];
  }
};


/**
 * A map from Stream object keys to MIME type parameters.  These should be
 * ignored by platforms that do not recognize them.
 *
 * This initial set of parameters are all recognized by Chromecast.
 *
 * @const {!Map<string, string>}
 * @private
 */
shaka.util.MimeUtils.EXTENDED_MIME_PARAMETERS_ = new Map()
    .set('codecs', 'codecs')
    .set('frameRate', 'framerate')  // Ours is camelCase, theirs is lowercase.
    .set('bandwidth', 'bitrate')  // They are in the same units: bits/sec.
    .set('width', 'width')
    .set('height', 'height')
    .set('channelsCount', 'channels');


/**
 * A mimetype created for CEA-608 closed captions.
 * @const {string}
 */
shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE = 'application/cea-608';

/**
 * A mimetype created for CEA-708 closed captions.
 * @const {string}
 */
shaka.util.MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE = 'application/cea-708';

/**
 * MIME types of raw formats.
 *
 * @const {!Array<string>}
 */
shaka.util.MimeUtils.RAW_FORMATS = [
  'audio/aac',
  'audio/ac3',
  'audio/ec3',
  'audio/mpeg',
];
