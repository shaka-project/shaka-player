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
 * @fileoverview AudioTrack class.
 */

goog.provide('shaka.player.AudioTrack');



/**
 * Creates a new AudioTrack.
 * @param {number} id
 * @param {?number} bandwidth
 * @param {?string} lang
 * @constructor
 */
shaka.player.AudioTrack = function(id, bandwidth, lang) {
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
   * The track's language, a BCP 47 language tag.
   *
   * @type {string}
   * @expose
   */
  this.lang = lang || 'unknown';

  /**
   * True if this is currently the active track.
   *
   * @type {boolean}
   * @expose
   */
  this.active = false;
};


/**
 * Compares two AudioTrack objects: first by language, and then by bandwidth.
 * @param {!shaka.player.AudioTrack} audioTrack1
 * @param {!shaka.player.AudioTrack} audioTrack2
 * @return {number}
 * @export
 */
shaka.player.AudioTrack.compare = function(audioTrack1, audioTrack2) {
  if (audioTrack1.lang < audioTrack2.lang) {
    return -1;
  } else if (audioTrack1.lang > audioTrack2.lang) {
    return 1;
  }

  if (audioTrack1.bandwidth < audioTrack2.bandwidth) {
    return -1;
  } else if (audioTrack1.bandwidth > audioTrack2.bandwidth) {
    return 1;
  }

  return 0;
};

