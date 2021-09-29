/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
goog.provide('shaka.polyfill.RandomUUID');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide window.crypto.randomUUID in all browsers.
 * @export
 */
shaka.polyfill.RandomUUID = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('randomUUID.install');

    if (!window.crypto) {
      // See: https://caniuse.com/cryptography
      shaka.log.debug(
          'window.crypto must be available to install randomUUID polyfill.');
      return;
    }

    if ('randomUUID' in window.crypto) {
      shaka.log.debug(
          'RandomUUID: Native window.crypto.randomUUID() support found.');
      return;
    }

    window.crypto.randomUUID = shaka.polyfill.RandomUUID.randomUUID_;
  }

  /**
   * @return {string}
   * @private
   */
  static randomUUID_() {
    const url = URL.createObjectURL(new Blob());
    const uuid = url.toString();
    URL.revokeObjectURL(url);
    return uuid.substr(uuid.lastIndexOf('/') + 1);
  }
};


shaka.polyfill.register(shaka.polyfill.RandomUUID.install);
