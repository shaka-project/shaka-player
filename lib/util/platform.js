/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.util.Platform');

goog.require('shaka.util.Timer');


/**
 * A wrapper for platform-specific functions.
 *
 * @final
 */
shaka.util.Platform = class {
  /**
   * Check if the current platform supports media source. We assume that if
   * the current platform supports media source, then we can use media source
   * as per its design.
   *
   * @return {boolean}
   */
  static supportsMediaSource() {
    // Browsers that lack a media source implementation will have no reference
    // to |window.MediaSource|. Platforms that we see having problematic media
    // source implementations will have this reference removed via a polyfill.
    if (!window.MediaSource) {
      return false;
    }

    // Some very old MediaSource implementations didn't have isTypeSupported.
    if (!MediaSource.isTypeSupported) {
      return false;
    }

    return true;
  }

  /**
   * Returns true if the media type is supported natively by the platform.
   *
   * @param {string} mimeType
   * @return {boolean}
   */
  static supportsMediaType(mimeType) {
    const video = shaka.util.Platform.anyMediaElement_();
    return video.canPlayType(mimeType) != '';
  }

  /**
   * Check if the current platform is MS Edge.
   *
   * @return {boolean}
   */
  static isEdge() {
    return shaka.util.Platform.userAgentContains_('Edge/');
  }

  /**
   * Check if the current platform is MS IE.
   *
   * @return {boolean}
   */
  static isIE() {
    return shaka.util.Platform.userAgentContains_('Trident/');
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
   * Check if the current platform is a Google Chromecast.
   *
   * @return {boolean}
   */
  static isChromecast() {
    return shaka.util.Platform.userAgentContains_('CrKey');
  }

  /**
   * Check if the current platform is Google Chrome.
   *
   * @return {boolean}
   */
  static isChrome() {
    // The Edge user agent will also contain the "Chrome" keyword, so we need
    // to make sure this is not Edge.
    return shaka.util.Platform.userAgentContains_('Chrome') &&
           !shaka.util.Platform.isEdge();
  }

  /**
   * Check if the current platform is an Apple device (iOS, desktop Safari, etc)
   *
   * @return {boolean}
   */
  static isApple() {
    return !!navigator.vendor && navigator.vendor.includes('Apple');
  }

  /**
   * Guesses if the platform is a mobile one (iOS or Android).
   *
   * @return {boolean}
   */
  static isMobile() {
    return /(?:iPhone|iPad|iPod|Android)/.test(navigator.userAgent);
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

  /**
   * For canPlayType queries, we just need any instance.
   *
   * First, use a cached element from a previous query.
   * Second, search the page for one.
   * Third, create a temporary one.
   *
   * Cached elements expire in one second so that they can be GC'd or removed.
   *
   * @return {!HTMLMediaElement}
   */
  static anyMediaElement_() {
    const Platform = shaka.util.Platform;
    if (Platform.cachedMediaElement_) {
      return Platform.cachedMediaElement_;
    }

    if (!Platform.cacheExpirationTimer_) {
      Platform.cacheExpirationTimer_ = new shaka.util.Timer(() => {
        Platform.cachedMediaElement_ = null;
      });
    }

    Platform.cachedMediaElement_ = /** @type {HTMLMediaElement} */(
        document.querySelector('video') || document.querySelector('audio'));

    if (!Platform.cachedMediaElement_) {
      Platform.cachedMediaElement_ = /** @type {!HTMLMediaElement} */(
          document.createElement('video'));
    }

    Platform.cacheExpirationTimer_.tickAfter(/* seconds= */ 1);
    return Platform.cachedMediaElement_;
  }
};

/** @private {shaka.util.Timer} */
shaka.util.Platform.cacheExpirationTimer_ = null;

/** @private {HTMLMediaElement} */
shaka.util.Platform.cachedMediaElement_ = null;
