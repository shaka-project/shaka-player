/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.PatchedMediaKeysCert');

goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.util.Platform');


/**
 * @summary A polyfill to fix setServerCertificate implementation on
 * older platforms which claim to support modern EME.
 * @export
 */
shaka.polyfill.PatchedMediaKeysCert = class {
  /**
   * Installs the polyfill if needed.
   * @export
   */
  static install() {
    if (!window.MediaKeys) {
      // No MediaKeys available
      return;
    }
    // eslint-disable-next-line no-restricted-syntax
    if (MediaKeys.prototype.setServerCertificate &&
        !shaka.polyfill.PatchedMediaKeysCert.hasInvalidImplementation_()) {
      // setServerCertificate is there and userAgent seems to be valid.
      return;
    }

    shaka.log.info('Patching MediaKeys.setServerCertificate');
    // eslint-disable-next-line no-restricted-syntax
    MediaKeys.prototype.setServerCertificate =
      shaka.polyfill.PatchedMediaKeysCert.setServerCertificate_;
  }

  /**
   * @param {!BufferSource} certificate
   * @return {!Promise<boolean>}
   * @private
   */
  static setServerCertificate_(certificate) {
    shaka.log.debug('PatchedMediaKeysCert.setServerCertificate');
    return Promise.resolve(false);
  }

  /**
   * @return {boolean}
   * @private
   */
  static hasInvalidImplementation_() {
    return shaka.util.Platform.isTizen3() || shaka.util.Platform.isTizen4() ||
      shaka.util.Platform.isTizen5_0() || shaka.util.Platform.isWebOS3();
  }
};

shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysCert.install);
