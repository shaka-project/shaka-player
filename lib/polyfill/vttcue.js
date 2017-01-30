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

  if (!window.VTTCue && !window.TextTrackCue) {
    // Avoid errors on very old browsers.
    return;
  }

  var constructorLength = TextTrackCue.length;
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

  if (window.VTTCue) {
    var proto = VTTCue.prototype;
    if (proto.hasOwnProperty('region')) {
      // No polyfill needed.
      shaka.log.info('Using native VTTCue.region');
      return;
    }
  }

  if (!window.VTTRegion) {
    window.VTTRegion = shaka.polyfill.VTTCue.VTTRegion;
  }
};


/**
 * Draft spec TextTrackCue with 3 constructor arguments.
 * See {@link https://goo.gl/ZXBWZi W3C Working Draft 25 October 2012}.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} text
 * @return {TextTrackCue}
 * @private
 */
shaka.polyfill.VTTCue.from3ArgsTextTrackCue_ = function(startTime, endTime,
    text) {
  return new window.TextTrackCue(startTime, endTime, text);
};


/**
 * Draft spec TextTrackCue with 6 constructor arguments (5th & 6th are
 * optional).
 * See {@link https://goo.gl/AYFqUh W3C Working Draft 29 March 2012}.
 * Quoting the access to the TextTrackCue object to avoid the compiler
 * complaining.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {string} text
 * @return {TextTrackCue}
 * @private
 */
shaka.polyfill.VTTCue.from6ArgsTextTrackCue_ = function(startTime, endTime,
    text) {
  var id = startTime + '-' + endTime + '-' + text;
  return new window['TextTrackCue'](id, startTime, endTime, text);
};


/**
 * IE10, IE11 and Edge returns TextTrackCue.length = 0 although it accepts 3
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



/**
 * Polyfill for VTTRegion based on the VTTCue
 * {@link https://w3c.github.io/webvtt/#the-vttregion-interface API}
 *
 * @constructor
 * @struct
 * @implements {VTTRegion}
 */
shaka.polyfill.VTTCue.VTTRegion = function() {
  this.width = 100;
  this.lines = 3;
  this.regionAnchorX = 0;
  this.regionAnchorY = 100;
  this.viewportAnchorX = 0;
  this.viewportAnchorY = 100;
  this.scroll = '';
};


/**
 * No native support for VTTRegion so we need to adjust
 * the cue positioning before adding cue to the browser
 *
 * @param {TextTrackCue} cue
 * @return {TextTrackCue}
 */
shaka.polyfill.VTTCue.VTTRegion.prototype.apply = function(cue) {
  if (cue.line != 'auto') {
    var vpAnchorY = this.viewportAnchorY;
    cue.line = (vpAnchorY + cue.line > 100) ? 100 : vpAnchorY + cue.line;
  }

  if (cue.position != 'auto') {
    var vpAnchorX = this.viewportAnchorX;
    cue.position =
        (vpAnchorX + cue.position > 100) ? 100 : vpAnchorX + cue.position;
  }

  return cue;
};


shaka.polyfill.register(shaka.polyfill.VTTCue.install);
