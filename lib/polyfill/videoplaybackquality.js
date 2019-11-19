/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.VideoPlaybackQuality');

goog.require('shaka.polyfill');


/**
 * @summary A polyfill to provide MSE VideoPlaybackQuality metrics.
 * Many browsers do not yet provide this API, and Chrome currently provides
 * similar data through individual prefixed attributes on HTMLVideoElement.
 */
shaka.polyfill.VideoPlaybackQuality = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    if (!window.HTMLVideoElement) {
      // Avoid errors on very old browsers.
      return;
    }

    // eslint-disable-next-line no-restricted-syntax
    const proto = HTMLVideoElement.prototype;
    if (proto.getVideoPlaybackQuality) {
      // No polyfill needed.
      return;
    }

    if ('webkitDroppedFrameCount' in proto) {
      proto.getVideoPlaybackQuality =
          shaka.polyfill.VideoPlaybackQuality.webkit_;
    }
  }

  /**
   * @this {HTMLVideoElement}
   * @return {!VideoPlaybackQuality}
   * @private
   */
  static webkit_() {
    return {
      'droppedVideoFrames': this.webkitDroppedFrameCount,
      'totalVideoFrames': this.webkitDecodedFrameCount,
      // Not provided by this polyfill:
      'corruptedVideoFrames': 0,
      'creationTime': NaN,
      'totalFrameDelay': 0,
    };
  }
};


shaka.polyfill.register(shaka.polyfill.VideoPlaybackQuality.install);
