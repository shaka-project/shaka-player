/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.Cue');
goog.provide('shaka.text.CueRegion');

goog.require('shaka.util.ArrayUtils');


/**
 * @implements {shaka.extern.Cue}
 * @export
 */
shaka.text.Cue = class {
  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   */
  constructor(startTime, endTime, payload) {
    const Cue = shaka.text.Cue;

    /**
     * @override
     * @exportInterface
     */
    this.startTime = startTime;

    /**
     * @override
     * @exportInterface
     */
    this.direction = Cue.direction.HORIZONTAL_LEFT_TO_RIGHT;

    /**
     * @override
     * @exportInterface
     */
    this.endTime = endTime;

    // The explicit type here is to work around an apparent compiler bug where
    // the compiler seems to get confused about the type.  Since we are
    // overriding the interface type, it shouldn't be necessary to do this.
    // Compiler version 20200517.
    /**
     * @override
     * @exportInterface
     * @type {string}
     */
    this.payload = payload;

    /**
     * @override
     * @exportInterface
     */
    this.region = new shaka.text.CueRegion();

    /**
     * @override
     * @exportInterface
     */
    this.position = null;

    /**
     * @override
     * @exportInterface
     */
    this.positionAlign = Cue.positionAlign.AUTO;

    /**
     * @override
     * @exportInterface
     */
    this.size = 0;

    /**
     * @override
     * @exportInterface
     */
    this.textAlign = Cue.textAlign.CENTER;

    /**
     * @override
     * @exportInterface
     */
    this.writingMode = Cue.writingMode.HORIZONTAL_TOP_TO_BOTTOM;

    /**
     * @override
     * @exportInterface
     */
    this.lineInterpretation = Cue.lineInterpretation.LINE_NUMBER;

    /**
     * @override
     * @exportInterface
     */
    this.line = null;

    /**
     * @override
     * @exportInterface
     */
    this.lineHeight = '';

    /**
     * Line Alignment is set to start by default.
     * @override
     * @exportInterface
     */
    this.lineAlign = Cue.lineAlign.START;

    /**
     * Set the captions at the bottom of the text container by default.
     * @override
     * @exportInterface
     */
    this.displayAlign = Cue.displayAlign.AFTER;

    /**
     * @override
     * @exportInterface
     */
    this.color = '';

    /**
     * @override
     * @exportInterface
     */
    this.backgroundColor = '';

    /**
     * @override
     * @exportInterface
     */
    this.backgroundImage = '';

    /**
     * @override
     * @exportInterface
     */
    this.border = '';

    /**
     * @override
     * @exportInterface
     */
    this.fontSize = '';

    /**
     * @override
     * @exportInterface
     */
    this.fontWeight = Cue.fontWeight.NORMAL;

    /**
     * @override
     * @exportInterface
     */
    this.fontStyle = Cue.fontStyle.NORMAL;

    /**
     * @override
     * @exportInterface
     */
    this.fontFamily = '';

    /**
     * @override
     * @exportInterface
     */
    this.letterSpacing = '';

    /**
     * @override
     * @exportInterface
     */
    this.linePadding = '';

    /**
     * @override
     * @exportInterface
     */
    this.opacity = 1;

    /**
     * @override
     * @exportInterface
     */
    this.textDecoration = [];

    /**
     * @override
     * @exportInterface
     */
    this.wrapLine = true;

    /**
     * @override
     * @exportInterface
     */
    this.id = '';

    /**
     * @override
     * @exportInterface
     */
    this.nestedCues = [];

    /**
     * @override
     * @exportInterface
     */
    this.lineBreak = false;

    /**
     * @override
     * @exportInterface
     */
    this.spacer = false;

    /**
     * @override
     * @exportInterface
     */
    this.cellResolution = {
      columns: 32,
      rows: 15,
    };
  }

  /**
   * @param {number} start
   * @param {number} end
   * @return {!shaka.text.Cue}
   */
  static lineBreak(start, end) {
    const cue = new shaka.text.Cue(start, end, '');
    cue.lineBreak = true;
    return cue;
  }

  /**
   * Create a copy of the cue with the same properties.
   * @return {!shaka.text.Cue}
   * @suppress {checkTypes} since we must use [] and "in" with a struct type.
   */
  clone() {
    const clone = new shaka.text.Cue(0, 0, '');

    for (const k in this) {
      clone[k] = this[k];

      // Make copies of array fields, but only one level deep.  That way, if we
      // change, for instance, textDecoration on the clone, we don't affect the
      // original.
      if (clone[k] && clone[k].constructor == Array) {
        clone[k] = /** @type {!Array} */(clone[k]).slice();
      }
    }

    return clone;
  }

  /**
   * Check if two Cues have all the same values in all properties.
   * @param {!shaka.text.Cue} cue1
   * @param {!shaka.text.Cue} cue2
   * @return {boolean}
   * @suppress {checkTypes} since we must use [] and "in" with a struct type.
   */
  static equal(cue1, cue2) {
    // Compare the start time, end time and payload of the cues first for
    // performance optimization.  We can avoid the more expensive recursive
    // checks if the top-level properties don't match.
    // See: https://github.com/google/shaka-player/issues/3018
    if (cue1.startTime != cue2.startTime || cue1.endTime != cue2.endTime ||
      cue1.payload != cue2.payload) {
      return false;
    }
    for (const k in cue1) {
      if (k == 'startTime' || k == 'endTime' || k == 'payload') {
        // Already compared.
      } else if (k == 'nestedCues') {
        // This uses shaka.text.Cue.equal rather than just this.equal, since
        // otherwise recursing here will unbox the method and cause "this" to be
        // undefined in deeper recursion.
        if (!shaka.util.ArrayUtils.equal(
            cue1.nestedCues, cue2.nestedCues, shaka.text.Cue.equal)) {
          return false;
        }
      } else if (k == 'region' || k == 'cellResolution') {
        for (const k2 in cue1[k]) {
          if (cue1[k][k2] != cue2[k][k2]) {
            return false;
          }
        }
      } else if (Array.isArray(cue1[k])) {
        if (!shaka.util.ArrayUtils.equal(cue1[k], cue2[k])) {
          return false;
        }
      } else {
        if (cue1[k] != cue2[k]) {
          return false;
        }
      }
    }

    return true;
  }
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.positionAlign = {
  'LEFT': 'line-left',
  'RIGHT': 'line-right',
  'CENTER': 'center',
  'AUTO': 'auto',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.textAlign = {
  'LEFT': 'left',
  'RIGHT': 'right',
  'CENTER': 'center',
  'START': 'start',
  'END': 'end',
};


/**
 * Vertical alignments of the cues within their extents.
 * 'BEFORE' means displaying at the top of the captions container box, 'CENTER'
 *  means in the middle, 'AFTER' means at the bottom.
 * @enum {string}
 * @export
 */
shaka.text.Cue.displayAlign = {
  'BEFORE': 'before',
  'CENTER': 'center',
  'AFTER': 'after',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.direction = {
  'HORIZONTAL_LEFT_TO_RIGHT': 'ltr',
  'HORIZONTAL_RIGHT_TO_LEFT': 'rtl',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.writingMode = {
  'HORIZONTAL_TOP_TO_BOTTOM': 'horizontal-tb',
  'VERTICAL_LEFT_TO_RIGHT': 'vertical-lr',
  'VERTICAL_RIGHT_TO_LEFT': 'vertical-rl',
};


/**
 * @enum {number}
 * @export
 */
shaka.text.Cue.lineInterpretation = {
  'LINE_NUMBER': 0,
  'PERCENTAGE': 1,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.lineAlign = {
  'CENTER': 'center',
  'START': 'start',
  'END': 'end',
};


/**
 * Default text color according to
 * https://w3c.github.io/webvtt/#default-text-color
 * @enum {string}
 * @export
 */
shaka.text.Cue.defaultTextColor = {
  'white': '#FFF',
  'lime': '#0F0',
  'cyan': '#0FF',
  'red': '#F00',
  'yellow': '#FF0',
  'magenta': '#F0F',
  'blue': '#00F',
  'black': '#000',
};


/**
 * Default text background color according to
 * https://w3c.github.io/webvtt/#default-text-background
 * @enum {string}
 * @export
 */
shaka.text.Cue.defaultTextBackgroundColor = {
  'bg_white': '#FFF',
  'bg_lime': '#0F0',
  'bg_cyan': '#0FF',
  'bg_red': '#F00',
  'bg_yellow': '#FF0',
  'bg_magenta': '#F0F',
  'bg_blue': '#00F',
  'bg_black': '#000',
};


/**
 * In CSS font weight can be a number, where 400 is normal and 700 is bold.
 * Use these values for the enum for consistency.
 * @enum {number}
 * @export
 */
shaka.text.Cue.fontWeight = {
  'NORMAL': 400,
  'BOLD': 700,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.fontStyle = {
  'NORMAL': 'normal',
  'ITALIC': 'italic',
  'OBLIQUE': 'oblique',
};


/**
 * @enum {string}
 * @export
 */
shaka.text.Cue.textDecoration = {
  'UNDERLINE': 'underline',
  'LINE_THROUGH': 'lineThrough',
  'OVERLINE': 'overline',
};


/**
 * @implements {shaka.extern.CueRegion}
 * @struct
 * @export
 */
shaka.text.CueRegion = class {
  /** */
  constructor() {
    const CueRegion = shaka.text.CueRegion;

    /**
     * @override
     * @exportInterface
     */
    this.id = '';

    /**
     * @override
     * @exportInterface
     */
    this.viewportAnchorX = 0;

    /**
     * @override
     * @exportInterface
     */
    this.viewportAnchorY = 0;

    /**
     * @override
     * @exportInterface
     */
    this.regionAnchorX = 0;

    /**
     * @override
     * @exportInterface
     */
    this.regionAnchorY = 0;

    /**
     * @override
     * @exportInterface
     */
    this.width = 100;

    /**
     * @override
     * @exportInterface
     */
    this.height = 100;

    /**
     * @override
     * @exportInterface
     */
    this.heightUnits = CueRegion.units.PERCENTAGE;

    /**
     * @override
     * @exportInterface
     */
    this.widthUnits = CueRegion.units.PERCENTAGE;

    /**
     * @override
     * @exportInterface
     */
    this.viewportAnchorUnits = CueRegion.units.PERCENTAGE;

    /**
     * @override
     * @exportInterface
     */
    this.scroll = CueRegion.scrollMode.NONE;
  }
};


/**
 * @enum {number}
 * @export
 */
shaka.text.CueRegion.units = {
  'PX': 0,
  'PERCENTAGE': 1,
  'LINES': 2,
};


/**
 * @enum {string}
 * @export
 */
shaka.text.CueRegion.scrollMode = {
  'NONE': '',
  'UP': 'up',
};
