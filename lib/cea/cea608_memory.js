/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea608Memory');
goog.provide('shaka.cea.Cea608Char');

goog.require('shaka.text.Cue');


/**
 * CEA-608 captions memory/buffer.
 */
shaka.cea.Cea608Memory = class {
  /**
   * @param {!number} fieldNum Field number.
   * @param {!number} channelNum Channel number.
   */
  constructor(fieldNum, channelNum) {
    /**
     * Buffer for storing decoded characters.
     * @private @const {!Array<!Array<!shaka.cea.Cea608Char>>}
     */
    this.rows_ = [];

    /**
     * Current row.
     * @private {!number}
     */
    this.row_ = 1;

    /**
     * Number of rows in the scroll window. Used for rollup mode.
     * @private {!number}
     */
    this.scrollRows_ = 0;

    /**
     * Field number.
     * @private {!number}
     */
    this.fieldNum_ = fieldNum;

    /**
     * Channel number.
     * @private {!number}
     */
    this.channelNum_ = channelNum;

    /**
     * @private {!boolean}
     */
    this.underline_ = false;

    /**
     * @private {!boolean}
     */
    this.italics_ = false;

    /**
     * @private {!string}
     */
    this.textColor_ = shaka.cea.Cea608Memory.DEFAULT_TXT_COLOR;

    /**
     * @private {!string}
     */
    this.backgroundColor_ = shaka.cea.Cea608Memory.DEFAULT_BG_COLOR;

    this.reset();
  }

  /**
   * Emits a closed caption based on the state of the buffer.
   * @param {!number} startTime Start time of the cue.
   * @param {!number} endTime End time of the cue.
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   */
  forceEmit(startTime, endTime) {
    const stream = `CC${(this.fieldNum_<< 1) | this.channelNum_ +1}`;

    // Find the first and last row that contains characters.
    let firstNonEmptyRow = -1;
    let lastNonEmptyRow = -1;

    for (let i = 0; i < this.rows_.length; i++) {
      if (this.rows_[i].length) {
        firstNonEmptyRow = i;
        break;
      }
    }

    for (let i = this.rows_.length - 1; i >= 0; i--) {
      if (this.rows_[i].length) {
        lastNonEmptyRow = i;
        break;
      }
    }

    // Exit early if no non-empty row was found.
    if (firstNonEmptyRow === -1 || lastNonEmptyRow === -1) {
      return null;
    }

    // Keeps track of the current styles for a cue being emitted.
    let currentUnderline = false;
    let currentItalics = false;
    let currentTextColor = shaka.cea.Cea608Memory.DEFAULT_TXT_COLOR;
    let currentBackgroundColor = shaka.cea.Cea608Memory.DEFAULT_BG_COLOR;

    // Create first cue that will be nested in top level cue. Default styles.
    let currentCue = this.createStyledCue_(startTime, endTime,
        currentUnderline, currentItalics,
        currentTextColor, currentBackgroundColor);

    // Logic: Reduce rows into a single top level cue containing nested cues.
    // Each nested cue corresponds either a style change or a line break.
    const topLevelCue = new shaka.text.Cue(
        startTime, endTime, /* payload= */ '');

    for (let i = firstNonEmptyRow; i <= lastNonEmptyRow; i++) {
      for (const styledChar of this.rows_[i]) {
        const underline = styledChar.isUnderlined();
        const italics = styledChar.isItalicized();
        const textColor = styledChar.getTextColor();
        const backgroundColor = styledChar.getBackgroundColor();

        // If any style properties have changed, we need to open a new cue.
        if (underline != currentUnderline || italics != currentItalics ||
            textColor != currentTextColor ||
            backgroundColor != currentBackgroundColor) {
          // Push the currently built cue and start a new cue, with new styles.
          if (currentCue.payload) {
            topLevelCue.nestedCues.push(currentCue);
          }
          currentCue = this.createStyledCue_(startTime, endTime,
              underline, italics, textColor, backgroundColor);

          currentUnderline = underline;
          currentItalics = italics;
          currentTextColor = textColor;
          currentBackgroundColor = backgroundColor;
        }

        currentCue.payload += styledChar.getChar();
      }
      if (currentCue.payload) {
        topLevelCue.nestedCues.push(currentCue);
      }

      // Create and push a linebreak cue to create a new line.
      if (i !== lastNonEmptyRow) {
        const spacerCue = new shaka.text.Cue(
            startTime, endTime, /* payload= */ '');
        spacerCue.spacer = true;
        topLevelCue.nestedCues.push(spacerCue);
      }

      // Create a new cue.
      currentCue = this.createStyledCue_(startTime, endTime,
          currentUnderline, currentItalics,
          currentTextColor, currentBackgroundColor);
    }

    if (topLevelCue.nestedCues.length) {
      return {
        cue: topLevelCue,
        stream,
      };
    }

    return null;
  }

  /**
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!boolean} underline
   * @param {!boolean} italics
   * @param {!string} txtColor
   * @param {!string} bgColor
   * @return {!shaka.text.Cue}
   * @private
   */
  createStyledCue_(startTime, endTime, underline, italics, txtColor, bgColor) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    if (underline) {
      cue.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);
    }
    if (italics) {
      cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    }
    cue.color = txtColor;
    cue.backgroundColor = bgColor;
    return cue;
  }

  /**
   * Resets the memory buffer.
   */
  reset() {
    this.resetAllRows();
    this.row_ = 1;
  }

  /**
   * @return {!number}
   */
  getRow() {
    return this.row_;
  }

  /**
   * @param {!number} row
   */
  setRow(row) {
    this.row_ = row;
  }

  /**
   * @return {!number}
   */
  getScrollSize() {
    return this.scrollRows_;
  }

  /**
   * @param {!number} scrollRows
   */
  setScrollSize(scrollRows) {
    this.scrollRows_ = scrollRows;
  }

  /**
   * Adds a character to the buffer.
   * @param {!shaka.cea.Cea608Memory.CharSet} set Character set.
   * @param {!number} b CC byte to add.
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
      const styledChar = new shaka.cea.Cea608Char(char, this.underline_,
          this.italics_, this.backgroundColor_, this.textColor_);
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
   * @param {!number} dst Destination row index.
   * @param {!number} src Source row index.
   * @param {!number} count Count of rows to move.
   */
  moveRows(dst, src, count) {
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
   * @param {!number} idx Starting index.
   * @param {!number} count Count of rows to reset.
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
   * @param {!boolean} underline
   */
  setUnderline(underline) {
    this.underline_ = underline;
  }

  /**
   * @param {!boolean} italics
   */
  setItalics(italics) {
    this.italics_ = italics;
  }

  /**
   * @param {!string} color
   */
  setTextColor(color) {
    this.textColor_ = color;
  }

  /**
   * @param {!string} color
   */
  setBackgroundColor(color) {
    this.backgroundColor_ = color;
  }
};

shaka.cea.Cea608Char = class {
  constructor(character, underline, italics, backgroundColor, textColor) {
    /**
     * @private {!string}
     */
    this.character_ = character;

    /**
     * @private {!boolean}
     */
    this.underline_ = underline;

    /**
     * @private {!boolean}
     */
    this.italics_ = italics;

    /**
     * @private {!string}
     */
    this.backgroundColor_ = backgroundColor;

    /**
     * @private {!string}
     */
    this.textColor_ = textColor;
  }

  /**
   * @return {!string}
   */
  getChar() {
    return this.character_;
  }

  /**
   * @return {!boolean}
   */
  isUnderlined() {
    return this.underline_;
  }

  /**
   * @return {!boolean}
   */
  isItalicized() {
    return this.italics_;
  }

  /**
   * @return {!string}
   */
  getBackgroundColor() {
    return this.backgroundColor_;
  }

  /**
   * @return {!string}
   */
  getTextColor() {
    return this.textColor_;
  }
};

/**
 * Maximum number of rows in the buffer.
 * @const {!number}
 */
shaka.cea.Cea608Memory.CC_ROWS = 15;

/**
 * Default background color for text.
 * @const {!string}
 */
shaka.cea.Cea608Memory.DEFAULT_BG_COLOR = 'black';

/**
 * Default text color.
 * @const {!string}
 */
shaka.cea.Cea608Memory.DEFAULT_TXT_COLOR = 'white';

/**
 * Characters sets.
 * @const @enum {!number}
 */
shaka.cea.Cea608Memory.CharSet = {
  BASIC_NORTH_AMERICAN: 0,
  SPECIAL_NORTH_AMERICAN: 1,
  SPANISH_FRENCH: 2,
  PORTUGUESE_GERMAN: 3,
};

/**
 * Basic North American char set deviates from ASCII with these exceptions.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.Cea608Memory.CharSet.BasicNorthAmericanChars = new Map([
  [0x27, '’'], [0x2a, 'á'], [0x5c, 'é'], [0x5c, 'é'], [0x5e, 'í'], [0x5f, 'ó'],
  [0x60, 'ú'], [0x7b, 'ç'], [0x7c, '÷'], [0x7d, 'Ñ'], [0x7e, 'ñ'], [0x7f, '█'],
]);

/**
 * Special North American char set.
 * Note: Transparent Space is currently implemented as a regular space.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.Cea608Memory.CharSet.SpecialNorthAmericanChars = new Map([
  [0x30, '®'], [0x31, '°'], [0x32, '½'], [0x33, '¿'], [0x34, '™'], [0x35, '¢'],
  [0x36, '£'], [0x37, '♪'], [0x38, 'à'], [0x39, '⠀'], [0x3a, 'è'], [0x3b, 'â'],
  [0x3c, 'ê'], [0x3d, 'î'], [0x3e, 'ô'], [0x3f, 'û'],
]);

/**
 * Extended Spanish/Misc/French char set.
 * @private @const {!Map<!number, !string>}
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
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.Cea608Memory.CharSet.ExtendedPortugueseGerman = new Map([
  [0x20, 'Ã'], [0x21, 'ã'], [0x22, 'Í'], [0x23, 'Ì'], [0x24, 'ì'], [0x25, 'Ò'],
  [0x26, 'ò'], [0x27, 'Õ'], [0x28, 'õ'], [0x29, '{'], [0x2a, '}'], [0x2b, '\\'],
  [0x2c, '^'], [0x2d, '_'], [0x2e, '|'], [0x2f, '~'], [0x30, 'Ä'], [0x31, 'ä'],
  [0x32, 'Ö'], [0x33, 'ö'], [0x34, 'ß'], [0x35, '¥'], [0x36, '¤'], [0x37, '│'],
  [0x38, 'Å'], [0x39, 'å'], [0x3a, 'Ø'], [0x3b, 'ø'], [0x3c, '┌'], [0x3d, '┐'],
  [0x3e, '└'], [0x3f, '┘'],
]);
