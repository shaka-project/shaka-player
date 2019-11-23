/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.IndexedDB');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.polyfill');


/**
 * @summary A polyfill to patch IndexedDB bugs.
 */
shaka.polyfill.IndexedDB = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('IndexedDB.install');

    let disableIDB = false;
    if (shaka.util.Platform.isChromecast()) {
      shaka.log.debug('Removing IndexedDB from ChromeCast');
      disableIDB = true;
    } else {
      try {
        // This is necessary to avoid Closure compiler over optimize this
        // block and remove it if it looks like a noop
        if (window.indexedDB) {
          disableIDB = false;
        }
      } catch (e) {
        shaka.log.debug(
            'Removing IndexedDB due to an exception when accessing it');
        disableIDB = true;
      }
    }

    if (disableIDB) {
      delete window.indexedDB;
      goog.asserts.assert(
          !window.indexedDB, 'Failed to override window.indexedDB');
    }
  }
};


shaka.polyfill.register(shaka.polyfill.IndexedDB.install);
