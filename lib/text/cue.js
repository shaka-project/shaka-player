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

goog.provide('shaka.text.Cue');



/**
 * Creates a Cue object.
 *
 * @param {number} startTime
 * @param {number} endTime
 * @param {!string} payload
 *
 * @constructor
 * @struct
 * @export
 */
shaka.text.Cue = function(startTime, endTime, payload) {
  var Cue = shaka.text.Cue;

  /**
   * The start time of the cue in seconds and fractions of a second.
   * @type {number}
   */
  this.startTime = startTime;

  /**
   * The end time of the cue in seconds and fractions of a second.
   * @type {number}
   */
  this.endTime = endTime;

  /**
   * The text payload of the cue.
   * @type {!string}
   */
  this.payload = payload;

  /**
   * The indent (in percent) of the cue box in the direction defined by the
   * writing direction.
   * @type {?number}
   */
  this.position = null;

  /**
   * Position alignment of the cue.
   * @type {shaka.text.Cue.positionAlign}
   */
  this.positionAlign = Cue.positionAlign.AUTO;

  /**
   * Size of the cue box (in percents).
   * @type {number}
   */
  this.size = 100;

  /**
   * Alignment of the text inside the cue box.
   * @type {shaka.text.Cue.textAlign}
   */
  this.textAlign = Cue.textAlign.CENTER;

  /**
   * Text writing direction of the cue.
   * (Vertical growing left, vertical growing right or horizontal).
   * NOTE: Horizontal right-to-left text is handled by setting
   * cue.textAlign to 'end'.
   * @type {shaka.text.Cue.writingDirection}
   */
  this.writingDirection = Cue.writingDirection.HORIZONTAL;

  /**
   * The way to interpret line field. (Either as an integer line number or
   * percentage from the display box).
   * @type {shaka.text.Cue.lineInterpretation}
   */
  this.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;

  /**
   * The offset from the display box in either number of lines or
   * percentage depending on the value of lineInterpretation.
   * @type {?number}
   */
  this.line = null;

  /**
   * Line alignment of the cue box.
   * @type {shaka.text.Cue.lineAlign}
   */
  this.lineAlign = Cue.lineAlign.CENTER;

  /**
   * Vertical alignments of the cues within their extents.
   * @type {shaka.text.Cue.displayAlign}
   */
  this.displayAlign = Cue.displayAlign.BEFORE;

  /**
   * Text color represented by any string that would be
   * accepted in CSS.
   * E. g. '#FFFFFF' or 'white'.
   * @type {!string}
   */
  this.color = '';

  /**
   * Text background color represented by any string that would be
   * accepted in CSS.
   * E. g. '#FFFFFF' or 'white'.
   * @type {!string}
   */
  this.backgroundColor = '';

  /**
   * Text font size in pixels.
   * @type {?number}
   */
  this.fontSize = null;

  /**
   * Text font weight. Either normal or bold.
   * @type {shaka.text.Cue.fontWeight}
   */
  this.fontWeight = Cue.fontWeight.NORMAL;

  /**
   * Text font family.
   * @type {!string}
   */
  this.fontFamily = '';

  /**
   * Whether or not line wrapping should be applied
   * to the cue.
   * @type {boolean}
   */
  this.wrapLine = true;

  /**
   * Id of the cue.
   * @type {!string}
   */
  this.id = '';
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.positionAlign = {
  LEFT: 'line-left',
  RIGHT: 'line-right',
  CENTER: 'center',
  AUTO: 'auto'
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.textAlign = {
  LEFT: 'left',
  RIGHT: 'right',
  CENTER: 'center',
  START: 'start',
  END: 'end'
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.displayAlign = {
  BEFORE: 'before',
  CENTER: 'center',
  AFTER: 'after'
};


/**
 * @enum {number}
 * @export
 */
shaka.text.Cue.writingDirection = {
  HORIZONTAL: 0,
  VERTICAL_LEFT: 1,
  VERTICAL_RIGHT: 2
};


/**
 * @enum {number}
 * @export
 */
shaka.text.Cue.lineInterpretation = {
  LINE_NUMBER: 0,
  PERCENTAGE: 1
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.lineAlign = {
  CENTER: 'center',
  START: 'start',
  END: 'end'
};


/**
 * In CSS font weight can be a number, where 400 is normal
 * and 700 is bold. Use these values for the enum for consistency.
 * @enum {number}
 * @export
 */
shaka.text.Cue.fontWeight = {
  NORMAL: 400,
  BOLD: 700
};

