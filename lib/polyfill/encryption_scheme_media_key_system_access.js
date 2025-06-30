/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess');


/**
 * A wrapper around MediaKeySystemAccess that adds encryptionScheme
 *   fields to the configuration, to emulate what a browser with native support
 *   for this field would do.
 *
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @see https://github.com/WICG/encrypted-media-encryption-scheme/issues/13
 * @implements {MediaKeySystemAccess}
 */
shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess = class {
  /**
   * @param {!MediaKeySystemAccess} mksa A native MediaKeySystemAccess instance
   *   to wrap.
   * @param {?string|undefined} videoScheme The encryption scheme to add to the
   *   configuration for video.
   * @param {?string|undefined} audioScheme The encryption scheme to add to the
   *   configuration for audio.
   */
  constructor(mksa, videoScheme, audioScheme) {
    /**
     * @const {!MediaKeySystemAccess}
     * @private
     */
    this.mksa_ = mksa;

    /**
     * @const {?string}
     * @private
     */
    this.videoScheme_ = videoScheme || null;

    /**
     * @const {?string}
     * @private
     */
    this.audioScheme_ = audioScheme || null;

    /** @const {string} */
    this.keySystem = mksa.keySystem;
  }

  /**
   * @override
   * @return {!MediaKeySystemConfiguration} A MediaKeys config with
   *   encryptionScheme fields added
   */
  getConfiguration() {
    // A browser which supports the encryptionScheme field would always return
    // that field in the resulting configuration.  So here, we emulate that.
    const configuration = this.mksa_.getConfiguration();

    if (configuration.videoCapabilities) {
      for (const capability of configuration.videoCapabilities) {
        capability['encryptionScheme'] = this.videoScheme_;
      }
    }

    if (configuration.audioCapabilities) {
      for (const capability of configuration.audioCapabilities) {
        capability['encryptionScheme'] = this.audioScheme_;
      }
    }

    return configuration;
  }

  /**
   * @override
   * @return {!Promise<!MediaKeys>} A passthrough of the native MediaKeys object
   */
  createMediaKeys() {
    return this.mksa_.createMediaKeys();
  }
};
