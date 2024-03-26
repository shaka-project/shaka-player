/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.AacTransmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.Mp4OutputTransmuxer');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.AacTransmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {!shaka.transmuxer.Mp4OutputTransmuxer} */
    this.mp4OutputTransmuxer = new shaka.transmuxer.Mp4OutputTransmuxer(
        shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.AAC);
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

    if (!this.isAacContainer_(mimeType)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'audio/aac'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isAacContainer_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'audio/aac';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isAacContainer_(mimeType)) {
      const codecs = shaka.util.MimeUtils.getCodecs(mimeType);
      return `audio/mp4; codecs="${codecs || 'mp4a.40.2'}"`;
    }
    return mimeType;
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

shaka.transmuxer.TransmuxerEngine.registerTransmuxer(
    'audio/aac',
    () => new shaka.transmuxer.AacTransmuxer('audio/aac'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
