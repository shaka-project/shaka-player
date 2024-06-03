/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.DrmUtils');


shaka.util.DrmUtils = class {
  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isPlayReadyKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.(microsoft|chromecast)\.playready/);
    }

    return false;
  }

  /**
   * @param {?string} keySystem
   * @return {boolean}
   */
  static isFairPlayKeySystem(keySystem) {
    if (keySystem) {
      return !!keySystem.match(/^com\.apple\.fps/);
    }

    return false;
  }
};
