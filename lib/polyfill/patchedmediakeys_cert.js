/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.PatchedMediaKeysCert');

goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.polyfill');


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
    const device = shaka.device.DeviceFactory.getDevice();
    // eslint-disable-next-line no-restricted-syntax
    if (MediaKeys.prototype.setServerCertificate &&
        device.supportsServerCertificate()) {
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
};

shaka.polyfill.register(shaka.polyfill.PatchedMediaKeysCert.install);
