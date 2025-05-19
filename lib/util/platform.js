/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Platform');


/**
 * A wrapper for platform-specific functions.
 *
 * @final
 */
shaka.util.Platform = class {
  /**
   * Return true if the platform is a Windows, regardless of the browser.
   *
   * @return {boolean}
   */
  static isWindows() {
    // Try the newer standard first.
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase() == 'windows';
    }
    // Fall back to the old API, with less strict matching.
    if (!navigator.platform) {
      return false;
    }
    return navigator.platform.toLowerCase().includes('win32');
  }
};
