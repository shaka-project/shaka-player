/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.StorageEstimate');

goog.require('shaka.polyfill');


/**
 * @summary A polyfill to provide navigator.storage.estimate in old
 * webkit browsers.
 * See: https://developers.google.com/web/updates/2017/08/estimating-available-storage-space#the-present
 */
shaka.polyfill.StorageEstimate = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    if (navigator.storage && navigator.storage.estimate) {
      // No need.
      return;
    }

    if (navigator.webkitTemporaryStorage &&
        navigator.webkitTemporaryStorage.queryUsageAndQuota) {
      if (!('storage' in navigator)) {
        navigator.storage = /** @type {!StorageManager} */ ({});
      }
      navigator.storage.estimate =
          shaka.polyfill.StorageEstimate.storageEstimate_;
    }
  }

  /**
   * @this {StorageManager}
   * @return {!Promise}
   * @private
   */
  static storageEstimate_() {
    return new Promise((resolve, reject) => {
      navigator.webkitTemporaryStorage.queryUsageAndQuota(
          (usage, quota) => {
            resolve({usage: usage, quota: quota});
          },
          reject,
      );
    });
  }
};


shaka.polyfill.register(shaka.polyfill.StorageEstimate.install);
