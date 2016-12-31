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
 * @summary A polyfill to provide VTTRegion interface in VTTCue.
 */


/**
 * Add the VTTRegion polyfill to VTTCue if needed
 */
shaka.polyfill.VTTCue.install = function() {
  if (!window.VTTCue && !window.TextTrackCue) {
    // Avoid errors on very old browsers.
    return;
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
