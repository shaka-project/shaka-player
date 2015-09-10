/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.player.Restrictions');



/**
 * Creates a Restrictions object, which describes a set of video track
 * restrictions. A VideoSource will not adapt (or permit switching) to video
 * tracks that do not meet the specified limitations.
 *
 * @constructor
 * @struct
 */
shaka.player.Restrictions = function() {
  /**
   * If set, specifies a maximum height for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxHeight = null;

  /**
   * If set, specifies a maximum width for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxWidth = null;

  /**
   * If set, specifies a maximum bandwidth for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.maxBandwidth = null;

  /**
   * If set, specifies a minimum bandwidth for video tracks.
   *
   * @type {?number}
   * @expose
   */
  this.minBandwidth = null;
};


/**
 * Clones the Restrictions.
 *
 * @return {!shaka.player.Restrictions}
 */
shaka.player.Restrictions.prototype.clone = function() {
  var restrictions = new shaka.player.Restrictions();
  restrictions.maxHeight = this.maxHeight;
  restrictions.maxWidth = this.maxWidth;
  restrictions.maxBandwidth = this.maxBandwidth;
  restrictions.minBandwidth = this.minBandwidth;
  return restrictions;
};

