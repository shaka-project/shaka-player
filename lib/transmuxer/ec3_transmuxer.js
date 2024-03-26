/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.transmuxer.Ec3Transmuxer');

goog.require('shaka.media.Capabilities');
goog.require('shaka.transmuxer.Mp4OutputTransmuxer');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.ManifestParserUtils');


/**
 * @implements {shaka.extern.Transmuxer}
 * @export
 */
shaka.transmuxer.Ec3Transmuxer = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {string} */
    this.originalMimeType_ = mimeType;

    /** @private {!shaka.transmuxer.Mp4OutputTransmuxer} */
    this.mp4OutputTransmuxer = new shaka.transmuxer.Mp4OutputTransmuxer(
        shaka.transmuxer.Mp4OutputTransmuxer.INPUT_FORMAT.EC3);
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

    if (!this.isEc3Container_(mimeType)) {
      return false;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return Capabilities.isTypeSupported(
        this.convertCodecs(ContentType.AUDIO, mimeType));
  }


  /**
   * Check if the mimetype is 'audio/ec3'.
   * @param {string} mimeType
   * @return {boolean}
   * @private
   */
  isEc3Container_(mimeType) {
    return mimeType.toLowerCase().split(';')[0] == 'audio/ec3';
  }


  /**
   * @override
   * @export
   */
  convertCodecs(contentType, mimeType) {
    if (this.isEc3Container_(mimeType)) {
      return 'audio/mp4; codecs="ec-3"';
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
    'audio/ec3',
    () => new shaka.transmuxer.Ec3Transmuxer('audio/ec3'),
    shaka.transmuxer.TransmuxerEngine.PluginPriority.FALLBACK);
