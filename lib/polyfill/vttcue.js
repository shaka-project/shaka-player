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

goog.require('shaka.log');
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

  if (!window.TextTrackCue) {
    shaka.log.error('VTTCue not available.');
    return;
  }

  let constructorLength = TextTrackCue.length;
  if (constructorLength == 3) {
    shaka.log.info('Using VTTCue polyfill from 3 argument TextTrackCue.');
    window.VTTCue = shaka.polyfill.VTTCue.from3ArgsTextTrackCue_;
  } else if (constructorLength == 6) {
    shaka.log.info('Using VTTCue polyfill from 6 argument TextTrackCue.');
    window.VTTCue = shaka.polyfill.VTTCue.from6ArgsTextTrackCue_;
  } else if (shaka.polyfill.VTTCue.canUse3ArgsTextTrackCue_()) {
    shaka.log.info('Using VTTCue polyfill from 3 argument TextTrackCue.');
    window.VTTCue = shaka.polyfill.VTTCue.from3ArgsTextTrackCue_;
  }
};


/**
 * Draft spec TextTrackCue with 3 constructor arguments.
 * @see {@link https://bit.ly/2IdyKbA W3C Working Draft 25 October 2012}.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} text
 * @return {!TextTrackCue}
 * @private
 */
shaka.polyfill.VTTCue.from3ArgsTextTrackCue_ = function(startTime, endTime,
    text) {
  return new window.TextTrackCue(startTime, endTime, text);
};


/**
 * Draft spec TextTrackCue with 6 constructor arguments (5th & 6th are
 * optional).
 * @see {@link https://bit.ly/2KaGSP2 W3C Working Draft 29 March 2012}.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} text
 * @return {!TextTrackCue}
 * @private
 */
shaka.polyfill.VTTCue.from6ArgsTextTrackCue_ = function(startTime, endTime,
    text) {
  let id = startTime + '-' + endTime + '-' + text;
  // Quoting the access to the TextTrackCue object to satisfy the compiler.
  return new window['TextTrackCue'](id, startTime, endTime, text);
};


/**
 * IE10, IE11 and Edge return TextTrackCue.length = 0, although they accept 3
 * constructor arguments.
 *
 * @return {boolean}
 * @private
 */
shaka.polyfill.VTTCue.canUse3ArgsTextTrackCue_ = function() {
  try {
    return !!shaka.polyfill.VTTCue.from3ArgsTextTrackCue_(1, 2, '');
  } catch (error) {
    return false;
  }
};


shaka.polyfill.register(shaka.polyfill.VTTCue.install);
