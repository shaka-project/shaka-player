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
 * @fileoverview VideoTrack class.
 */

goog.provide('shaka.player.VideoTrack');



/**
 * Creates a new VideoTrack.
 * @param {number} id
 * @param {?number} bandwidth
 * @param {?number} width
 * @param {?number} height
 * @constructor
 */
shaka.player.VideoTrack = function(id, bandwidth, width, height) {
  /**
   * A unique ID for the track.
   *
   * @type {number}
   * @expose
   */
  this.id = id;

  /**
   * The bandwidth required in bits per second.
   *
   * @type {number}
   * @expose
   */
  this.bandwidth = bandwidth || 0;

  /**
   * The track's width in pixels.
   *
   * @type {number}
   * @expose
   */
  this.width = width || 0;

  /**
   * The track's height in pixels.
   *
   * @type {number}
   * @expose
   */
  this.height = height || 0;

  /**
   * True if this is currently the active track.
   *
   * @type {boolean}
   * @expose
   */
  this.active = false;
};


/**
 * Compares two VideoTrack objects: first by resolution, and then by bandwidth.
 * @param {!shaka.player.VideoTrack} videoTrack1
 * @param {!shaka.player.VideoTrack} videoTrack2
 * @return {number}
 * @export
 */
shaka.player.VideoTrack.compare = function(videoTrack1, videoTrack2) {
  var resolution1 = videoTrack1.width * videoTrack1.height;
  var resolution2 = videoTrack2.width * videoTrack2.height;

  if (resolution1 < resolution2) {
    return -1;
  } else if (resolution1 > resolution2) {
    return 1;
  }

  if (videoTrack1.bandwidth < videoTrack2.bandwidth) {
    return -1;
  } else if (videoTrack1.bandwidth > videoTrack2.bandwidth) {
    return 1;
  }

  return 0;
};

