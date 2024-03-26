/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.TsTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.Mp4OutputTransmuxer');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.TsTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {!shaka.transmuxer.Mp4OutputTransmuxer} */
    this.mp4OutputTransmuxer = new shaka.transmuxer.Mp4OutputTransmuxer(
        shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.TS);
  }


  /**
   * @override
   * @export
   */
  destroy() {
    this.mp4OutputTransmuxer.release();
  }


  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   * @override
   * @export
   */
  isSupported(mimeType, contentType) {
    const Capabilities = shaka.media.Capabilities;

    if (!this.isTsContainer_(mimeType)) {
      return false;
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;

    let convertedMimeType = mimeType;
    if (contentType) {
      convertedMimeType = this.convertCodecs(contentType, mimeType);
    }
    const codecs = MimeUtils.getCodecs(convertedMimeType);
    const allCodecs = MimeUtils.splitCodecs(codecs);

    const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, allCodecs);
    const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, allCodecs);

    const TsTransmuxer = shaka.transmuxer.TsTransmuxer;

    if (audioCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(audioCodec);
      if (!TsTransmuxer.SUPPORTED_AUDIO_CODECS_.includes(normalizedCodec)) {
        return false;
      }
    }

    if (videoCodec) {
      const normalizedCodec = MimeUtils.getNormalizedCodec(videoCodec);
      if (!TsTransmuxer.SUPPORTED_VIDEO_CODECS_.includes(normalizedCodec)) {
        return false;
      }
    }

    if (contentType) {
      return Capabilities.isTypeSupported(
          this.convertCodecs(contentType, mimeType));
    }

    const audioMime = this.convertCodecs(ContentType.AUDIO, mimeType);
    const videoMime = this.convertCodecs(ContentType.VIDEO, mimeType);
    return Capabilities.isTypeSupported(audioMime) ||
        Capabilities.isTypeSupported(videoMime);
  }


  /**
   * Check if the mimetype is 'video/mp2t'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isTsContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'video/mp2t';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isTsContainer_(mimeType)) {
      const ContentType = shaka.util.ManifestParserUtils.ContentType;
      // The replace it's necessary because Firefox(the only browser that
      // supports MP3 in MP4) only support the MP3 codec with the mp3 string.
      // MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.34"') -> false
      // MediaSource.isTypeSupported('audio/mp4; codecs="mp3"') -> true
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType)
          .replace('mp4a.40.34', 'mp3').split(',')
          .map(this.getCorrectVideoCodecs_).join(',');
      if (contentType == ContentType.AUDIO) {
        return `audio/mp4; codecs="${codecs}"`;
      }
      return `video/mp4; codecs="${codecs}"`;
    }
    return mimeType;
  }


  /**
   * @param {string} codec
   * @return {string}
   * @private
   */
  getCorrectVideoCodecs_(codec) {
    if (codec.includes('avc1')) {
      // Convert avc1 codec string from RFC-4281 to RFC-6381 for
      // MediaSource.isTypeSupported
      // Example, convert avc1.66.30 to avc1.42001e (0x42 == 66 and 0x1e == 30)
      const avcdata = codec.split('.');
      if (avcdata.length == 3) {
        let result = avcdata.shift() + '.';
        result += parseInt(avcdata.shift(), 10).toString(16);
        result +=
            ('000' + parseInt(avcdata.shift(), 10).toString(16)).slice(-4);
        return result;
      }
    }
    return codec;
  }


  /**
   * @override
   * @export
   */
  getOriginalMimeType() {
    return this.originalMimeType_;
  }


  /**
   * @override
   * @export
   */
  transmux(data, stream, reference, duration, contentType) {
    return this.mp4OutputTransmuxer
        .transmux(data, stream, reference, duration, contentType);
  }
};

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array.<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_AUDIO_CODECS_ = [
  'aac',
  'ac-3',
  'ec-3',
  'mp3',
];

/**
 * Supported audio codecs.
 *
 * @private
 * @const {!Array.<string>}
 */
shaka.transmuxer.TsTransmuxer.SUPPORTED_VIDEO_CODECS_ = [
  'avc',
  'hevc',
];


shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'video/mp2t',
    () => new shaka.transmuxer.TsTransmuxer('video/mp2t'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.PREFERRED);
