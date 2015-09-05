/**
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
 *
 * @fileoverview A structure to contain text style.
 */

goog.provide('shaka.player.TextStyle');

goog.require('shaka.asserts');
goog.require('shaka.log');



/**
 * Creates a TextStyle object.
 *
 * <p><i>
 * Note that although this API is based on FCC guidelines, we cannot guarantee
 * that your application is in compliance with this or any other guideline.
 * </i></p>
 *
 * @constructor
 * @struct
 * @export
 */
shaka.player.TextStyle = function() {
  /**
   * Font size, such as 50%, 75%, 100%, 200%, or 300%.
   * @type {string}
   * @expose
   */
  this.fontSize = '100%';

  /**
   * @type {shaka.player.TextStyle.StandardColors}
   * @expose
   */
  this.fontColor = shaka.player.TextStyle.StandardColors.WHITE;

  /**
   * @type {shaka.player.TextStyle.StandardOpacities}
   * @expose
   */
  this.fontOpacity = shaka.player.TextStyle.StandardOpacities.OPAQUE;

  /**
   * @type {shaka.player.TextStyle.StandardColors}
   * @expose
   */
  this.backgroundColor = shaka.player.TextStyle.StandardColors.BLACK;

  /**
   * @type {shaka.player.TextStyle.StandardOpacities}
   * @expose
   */
  this.backgroundOpacity = shaka.player.TextStyle.StandardOpacities.OPAQUE;

  /**
   * @type {shaka.player.TextStyle.EdgeStyles}
   * @expose
   */
  this.fontEdge = shaka.player.TextStyle.EdgeStyles.NONE;
};


/**
 * Load TextStyle settings from localStorage.  Does nothing if no TextStyle data
 * has been stored.
 * @see {shaka.player.TextStyle.store}
 * @export
 */
shaka.player.TextStyle.prototype.load = function() {
  var item = window.localStorage.getItem('ShakaPlayerTextStyle');
  if (!item) {
    return;
  }

  var obj;
  try {
    obj = JSON.parse(item);
  } catch (exception) {
    shaka.log.warning('Loaded garbage from TextStyle storage!');
    return;
  }

  if (!obj || typeof obj != 'object') {
    shaka.log.warning('Loaded non-object from TextStyle storage!');
    return;
  }
  this.loadFrom_(/** @type {!Object} */(obj));
};


/**
 * @param {!Object} obj
 * @private
 * @suppress {checkTypes} to allow use of "[]" and "in" for a struct.
 */
shaka.player.TextStyle.prototype.loadFrom_ = function(obj) {
  for (var k in obj) {
    if (k in this) {
      this[k] = obj[k];
    }
  }
};


/**
 * Store this TextStyle's settings in localStorage.  Overwrites any
 * previously-stored settings.
 * @see {shaka.player.TextStyle.load}
 * @export
 */
shaka.player.TextStyle.prototype.store = function() {
  window.localStorage.setItem('ShakaPlayerTextStyle', JSON.stringify(this));
};


/**
 * Compute the CSS text necessary to represent this TextStyle.
 * Output does not contain any selectors.
 *
 * @return {string}
 */
shaka.player.TextStyle.prototype.toCSS = function() {
  var attributes = [];

  attributes.push('font-size: ' + this.fontSize);
  attributes.push('color: ' + this.toRGBA_(this.fontColor, this.fontOpacity));
  attributes.push('background-color: ' +
                  this.toRGBA_(this.backgroundColor, this.backgroundOpacity));

  // A given edge effect may be implemented with multiple shadows.
  // Collect them all into an array, then combine into one attribute.
  var shadows = [];
  for (var i = 0; i < this.fontEdge.length; ++i) {
    shaka.asserts.assert(this.fontEdge[i].length == 6);
    var color = this.fontEdge[i].slice(0, 3);
    var shadow = this.fontEdge[i].slice(3, 6);
    shadows.push(this.toRGBA_(color, this.fontOpacity) + ' ' +
                 shadow.join('px ') + 'px');
  }
  attributes.push('text-shadow: ' + shadows.join(','));

  return attributes.join('; ');
};


/**
 * @param {shaka.player.TextStyle.StandardColors} color
 * @param {shaka.player.TextStyle.StandardOpacities} opacity
 * @return {string}
 * @private
 */
shaka.player.TextStyle.prototype.toRGBA_ = function(color, opacity) {
  shaka.asserts.assert(color.length == 3);
  return 'rgba(' + color.concat(opacity).join(',') + ')';
};


/**
 * Defined in {@link https://goo.gl/ZcqOOM FCC 12-9}, paragraph 111, footnote
 * 448.  Each value is an array of the three RGB values for that color.
 * @enum {!Array.<number>}
 * @export
 */
shaka.player.TextStyle.StandardColors = {
  'WHITE': [255, 255, 255],
  'BLACK': [0, 0, 0],
  'RED': [255, 0, 0],
  'GREEN': [0, 255, 0],
  'BLUE': [0, 0, 255],
  'YELLOW': [255, 255, 0],
  'MAGENTA': [255, 0, 255],
  'CYAN': [0, 255, 255]
};


/**
 * Defined in {@link https://goo.gl/ZcqOOM FCC 12-9}, paragraph 111.
 * @enum {number}
 * @export
 */
shaka.player.TextStyle.StandardOpacities = {
  'OPAQUE': 1,
  'SEMI_HIGH': 0.75,
  'SEMI_LOW': 0.25,
  'TRANSPARENT': 0
};


/**
 * Defined in {@link https://goo.gl/ZcqOOM FCC 12-9}, paragraph 111.
 * The styles to achieve these effects are not specified anywhere.
 *
 * Each inner array represents a shadow, and is composed of RGB values for the
 * shadow color, followed by pixel values for x-offset, y-offset, and blur.
 *
 * @enum {!Array.<!Array.<number>>}
 * @export
 */
shaka.player.TextStyle.EdgeStyles = {
  'NONE': [],
  'RAISED': [
    [34, 34, 34, 1, 1, 0],
    [34, 34, 34, 2, 2, 0],
    [34, 34, 34, 3, 3, 0]],
  'DEPRESSED': [
    [204, 204, 204, 1, 1, 0],
    [204, 204, 204, 0, 1, 0],
    [34, 34, 34, -1, -1, 0],
    [34, 34, 34, 0, -1, 0]],
  'UNIFORM': [
    [34, 34, 34, 0, 0, 4],
    [34, 34, 34, 0, 0, 4],
    [34, 34, 34, 0, 0, 4],
    [34, 34, 34, 0, 0, 4]],
  'DROP': [
    [34, 34, 34, 2, 2, 3],
    [34, 34, 34, 2, 2, 4],
    [34, 34, 34, 2, 2, 5]]
};
