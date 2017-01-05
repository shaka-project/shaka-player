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

goog.provide('shaka.polyfill.VTTCue');

goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.VTTCue
 *
 * @summary A polyfill to provide VTTCue.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.VTTCue.install = function() {
  if (window.VTTCue) {
    shaka.log.info('Using native VTTCue.');
    return;
  }

  if (window.TextTrackCue &&
      window.TextTrackCue.prototype.constructor.length == 7) {
    window.VTTCue = shaka.polyfill.VTTCue.from7ArgsTextTrackCue_;
  }
};


/**
 * Draft spec TextTrackCue with 7 constructor arguments.
 * See {@link https://goo.gl/CSPvbz Using the TextTrack API} and examples.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} text
 * @return {function(new:VTTCue, number, number, string)}
 * @private
 */
shaka.polyfill.VTTCue.from7ArgsTextTrackCue_ = function(startTime, endTime,
    text) {
  return new window['TextTrackCue'](text, startTime, endTime, '', '', '', true);
};


shaka.polyfill.register(shaka.polyfill.VTTCue.install);
