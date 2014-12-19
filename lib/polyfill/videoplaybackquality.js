/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A polyfill to provide MSE VideoPlaybackQuality metrics with a
 * single API.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.VideoPlaybackQuality');


/**
 * @namespace shaka.polyfill.VideoPlaybackQuality
 * @export
 *
 * @summary A polyfill to provide MSE VideoPlaybackQuality metrics.
 * Many browsers do not yet provide this API, and Chrome currently provides
 * similar data through individual prefixed attributes on HTMLVideoElement.
 */


/**
 * Install the polyfill if needed.
 * @export
 */
shaka.polyfill.VideoPlaybackQuality.install = function() {
  var proto = HTMLVideoElement.prototype;
  if (proto.getVideoPlaybackQuality) {
    // No polyfill needed.
    return;
  }

  /**
   * @this {HTMLVideoElement}
   * @return {VideoPlaybackQuality}
   */
  proto.getVideoPlaybackQuality = function() {
    if (!('webkitDroppedFrameCount' in this)) {
      // No stats available.
      return null;
    }

    return /** @type {VideoPlaybackQuality} */ ({
      'corruptedVideoFrames': 0,
      'droppedVideoFrames': this.webkitDroppedFrameCount,
      'totalVideoFrames': this.webkitDecodedFrameCount,
      // Not provided by this polyfill:
      'creationTime': null,
      'totalFrameDelay': null
    });
  };
};

