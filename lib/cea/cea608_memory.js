/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea608Memory');

goog.require('shaka.cea.CeaUtils');
goog.require('shaka.text.Cue');


/**
 * CEA-608 captions memory/buffer.
 */
shaka.cea.Cea608Memory = class {
  /**
   * @param {number} fieldNum Field number.
   * @param {number} channelNum Channel number.
   */
  constructor(fieldNum, channelNum) {
    /**
     * Buffer for storing decoded characters.
     * @private @const {!Array<!Array<!shaka.cea.CeaUtils.StyledChar>>}
     */
    this.rows_ = [];

    /**
     * Current row.
     * @private {number}
     */
    this.row_ = 1;

    /**
     * Number of rows in the scroll window. Used for rollup mode.
     * @private {number}
     */
    this.scrollRows_ = 0;

    /**
     * Field number.
     * @private {number}
     */
    this.fieldNum_ = fieldNum;

    /**
     * Channel number.
     * @private {number}
     */
    this.channelNum_ = channelNum;

    /**
     * @private {boolean}
     */
    this.underline_ = false;

    /**
     * @private {boolean}
     */
    this.italics_ = false;

    /**
     * @private {string}
     */
    this.textColor_ = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;

    /**
     * @private {string}
     */
    this.backgroundColor_ = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;

    /**
     * @private {?number}
     */
    this.offset_ = null;

    /**
     * @private {?number}
     */
    this.indent_ = null;

    this.reset();
  }

  /**
   * Emits a closed caption based on the state of the buffer.
   * @param {number} startTime Start time of the cue.
   * @param {number} endTime End time of the cue.
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   */
  forceEmit(startTime, endTime) {
    const Cea608Memory = shaka.cea.Cea608Memory;
    const stream = `CC${((this.fieldNum_<< 1) | this.channelNum_) + 1}`;
    const topLevelCue = new shaka.text.Cue(
        startTime, endTime, /* payload= */ '');
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    let line = Cea608Memory.ROW_TO_LINE_CONVERSION_.get(this.row_);
    if (line) {
      topLevelCue.line = line;
    }
    if (this.indent_ != null && this.offset_ != null) {
      topLevelCue.position = 10 + Math.min(70, this.indent_ * 10) +
          this.offset_ * 2.5;
    }
    const ret = shaka.cea.CeaUtils.getParsedCaption(
        topLevelCue, stream, this.rows_, startTime, endTime);
    // If the text and its lines are larger than what we can show on the
    // screen, we move the lines up so that the text does not come out of the
    // video.
    if (ret && (this.row_ + ret.cue.nestedCues.length - 3) > 15) {
      const newLinePosition = this.row_ + 3 - ret.cue.nestedCues.length;
      line = Cea608Memory.ROW_TO_LINE_CONVERSION_.get(newLinePosition);
      if (line) {
        topLevelCue.line = line;
      }
    }
    return ret;
  }

  /**
   * Resets the memory buffer.
   */
  reset() {
    this.resetAllRows();
    this.row_ = 1;
  }

  /**
   * @return {number}
   */
  getRow() {
    return this.row_;
  }

  /**
   * @param {number} row
   */
  setRow(row) {
    this.row_ = row;
  }

  /**
   * @return {number}
   */
  getScrollSize() {
    return this.scrollRows_;
  }

  /**
   * @param {number} scrollRows
   */
  setScrollSize(scrollRows) {
    this.scrollRows_ = scrollRows;
  }

  /**
   * Adds a character to the buffer.
   * @param {!shaka.cea.Cea608Memory.CharSet} set Character set.
   * @param {number} b CC byte to add.
   */
  addChar(set, b) {
    // Valid chars are in the range [0x20, 0x7f]
    if (b < 0x20 || b > 0x7f) {
      return;
    }

    let char = '';
    switch (set) {
      case shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN:
        if (shaka.cea.Cea608Memory.CharSet.BasicNorthAmericanChars.has(b)) {
          char =
                shaka.cea.Cea608Memory.CharSet.BasicNorthAmericanChars.get(b);
        } else {
          // Regular ASCII
          char = String.fromCharCode(b);
        }
        break;
      case shaka.cea.Cea608Memory.CharSet.SPECIAL_NORTH_AMERICAN:
        char =
              shaka.cea.Cea608Memory.CharSet.SpecialNorthAmericanChars.get(b);
        break;
      case shaka.cea.Cea608Memory.CharSet.SPANISH_FRENCH:
        // Extended charset does a BS over preceding char, 6.4.2 EIA-608-B.
        this.eraseChar();
        char =
              shaka.cea.Cea608Memory.CharSet.ExtendedSpanishFrench.get(b);
        break;
      case shaka.cea.Cea608Memory.CharSet.PORTUGUESE_GERMAN:
        this.eraseChar();
        char =
              shaka.cea.Cea608Memory.CharSet.ExtendedPortugueseGerman.get(b);
        break;
    }

    if (char) {
      const styledChar = new shaka.cea.CeaUtils.StyledChar(
          char, this.underline_, this.italics_,
          this.backgroundColor_, this.textColor_);
      this.rows_[this.row_].push(styledChar);
    }
  }

  /**
   * Erases a character from the buffer.
   */
  eraseChar() {
    this.rows_[this.row_].pop();
  }

  /**
   * Moves rows of characters.
   * @param {number} dst Destination row index.
   * @param {number} src Source row index.
   * @param {number} count Count of rows to move.
   */
  moveRows(dst, src, count) {
    if (src < 0 || dst < 0) {
      return;
    }

    if (dst >= src) {
      for (let i = count-1; i >= 0; i--) {
        this.rows_[dst + i] = this.rows_[src + i].map((e) => e);
      }
    } else {
      for (let i = 0; i < count; i++) {
        this.rows_[dst + i] = this.rows_[src + i].map((e) => e);
      }
    }
  }

  /**
   * Resets rows of characters.
   * @param {number} idx Starting index.
   * @param {number} count Count of rows to reset.
   */
  resetRows(idx, count) {
    for (let i = 0; i <= count; i++) {
      this.rows_[idx + i] = [];
    }
  }

  /**
   * Resets the entire memory buffer.
   */
  resetAllRows() {
    this.resetRows(0, shaka.cea.Cea608Memory.CC_ROWS);
  }

  /**
   * Erases entire memory buffer.
   * Doesn't change scroll state or number of rows.
   */
  eraseBuffer() {
    this.row_ = (this.scrollRows_ > 0) ? this.scrollRows_ : 0;
    this.resetAllRows();
  }

  /**
   * @param {boolean} underline
   */
  setUnderline(underline) {
    this.underline_ = underline;
  }

  /**
   * @param {boolean} italics
   */
  setItalics(italics) {
    this.italics_ = italics;
  }

  /**
   * @param {string} color
   */
  setTextColor(color) {
    this.textColor_ = color;
  }

  /**
   * @param {string} color
   */
  setBackgroundColor(color) {
    this.backgroundColor_ = color;
  }

  /**
   * @param {number} offset
   */
  setOffset(offset) {
    this.offset_ = offset;
  }

  /**
   * @param {?number} indent
   */
  setIndent(indent) {
    this.indent_ = indent;
  }
};

/**
 * Maximum number of rows in the buffer.
 * @const {number}
 */
shaka.cea.Cea608Memory.CC_ROWS = 15;

/**
 * Characters sets.
 * @const @enum {number}
 */
shaka.cea.Cea608Memory.CharSet = {
  BASIC_NORTH_AMERICAN: 0,
  SPECIAL_NORTH_AMERICAN: 1,
  SPANISH_FRENCH: 2,
  PORTUGUESE_GERMAN: 3,
};

/**
 * Basic North American char set deviates from ASCII with these exceptions.
 * @private @const {!Map<number, string>}
 */
shaka.cea.Cea608Memory.CharSet.BasicNorthAmericanChars = new Map([
  [0x27, '’'], [0x2a, 'á'], [0x5c, 'é'], [0x5c, 'é'], [0x5e, 'í'], [0x5f, 'ó'],
  [0x60, 'ú'], [0x7b, 'ç'], [0x7c, '÷'], [0x7d, 'Ñ'], [0x7e, 'ñ'], [0x7f, '█'],
]);

/**
 * Special North American char set.
 * Note: Transparent Space is currently implemented as a regular space.
 * @private @const {!Map<number, string>}
 */
shaka.cea.Cea608Memory.CharSet.SpecialNorthAmericanChars = new Map([
  [0x30, '®'], [0x31, '°'], [0x32, '½'], [0x33, '¿'], [0x34, '™'], [0x35, '¢'],
  [0x36, '£'], [0x37, '♪'], [0x38, 'à'], [0x39, ' '], [0x3a, 'è'], [0x3b, 'â'],
  [0x3c, 'ê'], [0x3d, 'î'], [0x3e, 'ô'], [0x3f, 'û'],
]);

/**
 * Extended Spanish/Misc/French char set.
 * @private @const {!Map<number, string>}
 */
shaka.cea.Cea608Memory.CharSet.ExtendedSpanishFrench = new Map([
  [0x20, 'Á'], [0x21, 'É'], [0x22, 'Ó'], [0x23, 'Ú'], [0x24, 'Ü'], [0x25, 'ü'],
  [0x26, '‘'], [0x27, '¡'], [0x28, '*'], [0x29, '\''], [0x2a, '─'], [0x2b, '©'],
  [0x2c, '℠'], [0x2d, '·'], [0x2e, '“'], [0x2f, '”'], [0x30, 'À'], [0x31, 'Â'],
  [0x32, 'Ç'], [0x33, 'È'], [0x34, 'Ê'], [0x35, 'Ë'], [0x36, 'ë'], [0x37, 'Î'],
  [0x38, 'Ï'], [0x39, 'ï'], [0x3a, 'Ô'], [0x3b, 'Ù'], [0x3c, 'ù'], [0x3d, 'Û'],
  [0x3e, '«'], [0x3f, '»'],
]);

/**
 * Extended Portuguese/German/Danish char set.
 * @private @const {!Map<number, string>}
 */
shaka.cea.Cea608Memory.CharSet.ExtendedPortugueseGerman = new Map([
  [0x20, 'Ã'], [0x21, 'ã'], [0x22, 'Í'], [0x23, 'Ì'], [0x24, 'ì'], [0x25, 'Ò'],
  [0x26, 'ò'], [0x27, 'Õ'], [0x28, 'õ'], [0x29, '{'], [0x2a, '}'], [0x2b, '\\'],
  [0x2c, '^'], [0x2d, '_'], [0x2e, '|'], [0x2f, '~'], [0x30, 'Ä'], [0x31, 'ä'],
  [0x32, 'Ö'], [0x33, 'ö'], [0x34, 'ß'], [0x35, '¥'], [0x36, '¤'], [0x37, '│'],
  [0x38, 'Å'], [0x39, 'å'], [0x3a, 'Ø'], [0x3b, 'ø'], [0x3c, '┌'], [0x3d, '┐'],
  [0x3e, '└'], [0x3f, '┘'],
]);

/**
 * @private @const {!Map<number, number>}
 */
shaka.cea.Cea608Memory.ROW_TO_LINE_CONVERSION_ = new Map([
  [1, 10], [2, 15.33], [3, 20.66], [4, 26], [5, 31.33], [6, 36.66], [7, 42],
  [8, 47.33], [9, 52.66], [10, 58], [11, 63.33], [12, 68.66], [13, 74],
  [14, 79.33], [15, 84.66],
]);
