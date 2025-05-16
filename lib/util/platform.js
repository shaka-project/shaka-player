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
   * Check if the current platform is MS Edge.
   *
   * @return {boolean}
   */
  static isEdge() {
    // Legacy Edge contains "Edge/version".
    // Chromium-based Edge contains "Edg/version" (no "e").
    if (navigator.userAgent.match(/Edge?\//)) {
      return true;
    }

    return false;
  }

  /**
   * Check if the current platform is an Xbox One.
   *
   * @return {boolean}
   */
  static isXboxOne() {
    return shaka.util.Platform.userAgentContains_('Xbox One');
  }

  /**
   * Check if the current platform is a Tizen TV.
   *
   * @return {boolean}
   */
  static isTizen() {
    return shaka.util.Platform.userAgentContains_('Tizen');
  }

  /**
   * Check if the current platform is a Tizen 3 TV.
   *
   * @return {boolean}
   */
  static isTizen3() {
    return shaka.util.Platform.userAgentContains_('Tizen 3');
  }

  /**
   * Check if the current platform is a WebOS.
   *
   * @return {boolean}
   */
  static isWebOS() {
    return shaka.util.Platform.userAgentContains_('Web0S');
  }

  /**
   * Check if the current platform is Firefox.
   *
   * @return {boolean}
   */
  static isFirefox() {
    return shaka.util.Platform.userAgentContains_('Firefox');
  }

  /**
   * Check if the current platform is Playstation 4.
   * @return {boolean}
   */
  static isPS4() {
    return shaka.util.Platform.userAgentContains_('PlayStation 4');
  }

  /**
   * Check if the current platform is Sony TV.
   * @return {boolean}
   */
  static isSonyTV() {
    return shaka.util.Platform.userAgentContains_('sony.hbbtv.tv.G5');
  }

  /**
   * Check if the current platform is SkyQ STB.
   * @return {boolean}
   */
  static isSkyQ() {
    return shaka.util.Platform.userAgentContains_('Sky_STB');
  }

  /**
   * Check if the current platform is Deutsche Telecom Zenterio STB.
   * @return {boolean}
   */
  static isZenterio() {
    return shaka.util.Platform.userAgentContains_('DT_STB_BCM');
  }

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

  /**
   * Check if the user agent contains a key. This is the best way we know of
   * right now to detect platforms. If there is a better way, please send a
   * PR.
   *
   * @param {string} key
   * @return {boolean}
   * @private
   */
  static userAgentContains_(key) {
    const userAgent = navigator.userAgent || '';
    return userAgent.includes(key);
  }
};
