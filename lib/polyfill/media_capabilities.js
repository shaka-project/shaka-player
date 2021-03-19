/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaCapabilities');

goog.require('shaka.log');
goog.require('shaka.polyfill');


/**
 * @summary A polyfill to provide navigator.mediaCapabilities on all browsers.
 * This is necessary for Tizen 3, Xbox One and possibly others we have yet to
 * discover.
 */
shaka.polyfill.MediaCapabilities = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('MediaCapabilities: install');

    if (navigator.mediaCapabilities) {
      shaka.log.debug(
          'MediaCapabilities: Native mediaCapabilities support found.');
      return;
    }

    navigator.mediaCapabilities = /** @type {!MediaCapabilities} */ ({});
    navigator.mediaCapabilities.decodingInfo =
        shaka.polyfill.MediaCapabilities.decodingInfo_;
  }

  /**
   * @param {!MediaDecodingConfiguration} mediaDecodingConfig
   * @return {!Promise.<!MediaCapabilitiesDecodingInfo>}
   * @private
   */
  static decodingInfo_(mediaDecodingConfig) {
    const res = {
      supported: false,
      powerEfficient: true,
      smooth: true,
      keySystemAccess: null,
      configuration: mediaDecodingConfig,
    };

    if (!mediaDecodingConfig) {
      return Promise.resolve(res);
    }

    // Use 'MediaSource.isTypeSupported' to check if the stream is supported.
    if (mediaDecodingConfig['video']) {
      const contentType = mediaDecodingConfig['video'].contentType;
      const isSupported = MediaSource.isTypeSupported(contentType);
      if (!isSupported) {
        return Promise.resolve(res);
      }
    }

    if (mediaDecodingConfig['audio']) {
      const contentType = mediaDecodingConfig['audio'].contentType;
      const isSupported = MediaSource.isTypeSupported(contentType);
      if (!isSupported) {
        return Promise.resolve(res);
      }
    }

    res.supported = true;
    return Promise.resolve(res);
  }
};


shaka.polyfill.register(shaka.polyfill.MediaCapabilities.install);
