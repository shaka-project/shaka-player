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
 * @fileoverview TextTrack class.
 */

goog.provide('shaka.player.TextTrack');



/**
 * Creates a new TextTrack.
 * @param {number} id
 * @param {?string} lang
 * @constructor
 */
shaka.player.TextTrack = function(id, lang) {
  /**
   * A unique ID for the track.
   *
   * @type {number}
   * @expose
   */
  this.id = id;

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

  /**
   * True if this track is currently being displayed.
   *
   * @type {boolean}
   * @expose
   */
  this.enabled = false;
};


/**
 * Compares two TextTrack objects by language.
 * @param {!shaka.player.TextTrack} textTrack1
 * @param {!shaka.player.TextTrack} textTrack2
 * @return {number}
 * @export
 */
shaka.player.TextTrack.compare = function(textTrack1, textTrack2) {
  if (textTrack1.lang < textTrack2.lang) {
    return -1;
  } else if (textTrack1.lang > textTrack2.lang) {
    return 1;
  }

  return 0;
};

