/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea608Memory');

/**
 * CEA-608 captions memory/buffer.
 */
shaka.cea.Cea608Memory = class {
  /**
   * @param {!shaka.cea.AtscDecoder} decoder CEA-608 decoder.
   * @param {!number} fieldNum Field number.
   * @param {!number} chanNum Channel number.
   * @param {!boolean} textmode Indicates whether text mode is on/off.
   */
  constructor(decoder, fieldNum, chanNum, textmode) {
    /**
     * Buffer for storing decoded characters.
     * @private @const {!Array<!string>}
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
    this.fldnum_ = fieldNum;

    /**
     * Channel number.
     * @private {!number}
     */
    this.chnum_ = chanNum;

    /**
     * Text mode on/off.
     * @private {!boolean}
     */
    this.textmode_ = textmode;

    /**
     * Maps row to currently open style tags (italics, underlines, colors).
     * @private {!Map<!number, !Array<!string>>}
     */
    this.styleTags_ = new Map();

    /**
     * CEA-608 decoder.
     * @private @const {!shaka.cea.AtscDecoder}
     */
    this.decoder_ = decoder;

    this.reset();

    // Text mode currently not emitted, so it is unused.
    shaka.util.Functional.ignored(this.textmode_);
  }

  /**
   * Emits a cue based on the state of the buffer.
   * @param {!number} startTime Start time of the cue.
   * @param {!number} endTime End time of the cue.
   */
  forceEmit(startTime, endTime) {
    // Ensure ALL style tags are closed
    this.closeMatchingStyleTags(new RegExp('.*'));

    // If we emit text mode in future, prefix would be based on this.textmode.
    const stream = `CC${(this.fldnum_<< 1) | this.chnum_ +1}`;

    // Reduce the rows into a single cue text separated by new lines.
    const text = this.rows_.reduce((accumulatedText, rowText, i) => {
      return accumulatedText + `${rowText}\n`;
    }).trim();

    if (text) {
      this.decoder_.addCue({
        startTime,
        endTime,
        stream,
        text,
      });
    }
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
   * Opens the supplied style tag at the current position.
   * @param {!string} tag
   */
  openStyleTag(tag) {
    if (!this.styleTags_.has(this.row_)) {
      this.styleTags_.set(this.row_, []);
    }
    this.rows_[this.row_] += `<${tag}>`;
    this.styleTags_.get(this.row_).push(tag);
  }

  /**
   * Closes and clears all currently active style tags, that match
   * the regex, and reopens those that don't match the regex.
   * @param {?RegExp} regex
   */
  closeMatchingStyleTags(regex) {
    if (!this.styleTags_.has(this.row_)) {
      return;
    }
    const openStylesForRow = this.styleTags_.get(this.row_);
    const tagsToReopen = [];

    // Close tags in the reverse order of which they were opened.
    for (let i = openStylesForRow.length -1; i >= 0; i--) {
      this.rows_[this.row_] += `</${openStylesForRow[i][0]}>`;
      if (regex && !regex.test(openStylesForRow[i])) {
        tagsToReopen.push(openStylesForRow[i]);
      }
    }
    openStylesForRow.length = 0;

    // Now reopen the tags that weren't specified by the regex.
    for (const tag of tagsToReopen) {
      this.openStyleTag(tag);
    }
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
      this.rows_[this.row_] += char;
    }
  }

  /**
   * Erases a character from the buffer.
   */
  eraseChar() {
    const rowText = this.rows_[this.row_];

    // Unicode Aware - makes use of string's iterator.
    this.rows_[this.row_] = Array.from(rowText).slice(0, -1).join('');
  }

  /**
   * Moves rows of characters.
   * @param {!number} dst Destination row index.
   * @param {!number} src Source row index.
   * @param {!number} count Count of rows to move.
   */
  moveRows(dst, src, count) {
    for (let i = 0; i < count; i++) {
      this.rows_[dst + i] = this.rows_[src + i];

      // Shift the styles of the rows up as well.
      if (this.styleTags_.has(src + i)) {
        this.styleTags_.set(dst + i, this.styleTags_.get(src + i));
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
      this.rows_[idx + i] = '';
      this.styleTags_.delete(idx + i);
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
    this.row_ = (this.scrollRows_ > 0) ? this.scrollRows_ : 1;
    this.resetAllRows();
  }
};

/**
 * Maximum number of rows in the buffer.
 * @public @const {!number}
 */
shaka.cea.Cea608Memory.CC_ROWS = 15;

/**
 * Characters sets.
 * @public @const @enum {!number}
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
  [0x2a, 'á'], [0x5c, 'é'], [0x5c, 'é'], [0x5e, 'í'], [0x5f, 'ó'], [0x60, 'ú'],
  [0x7b, 'ç'], [0x7c, '÷'], [0x7d, 'Ñ'], [0x7e, 'ñ'], [0x7f, '█'],
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
  [0x26, '´'], [0x27, '¡'], [0x28, '*'], [0x29, '\''], [0x2a, '-'], [0x2b, '©'],
  [0x2c, '℠'], [0x2d, '·'], [0x2e, '"'], [0x2f, '"'], [0x30, 'À'], [0x31, 'Â'],
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
  [0x32, 'Ö'], [0x33, 'ö'], [0x34, 'ß'], [0x35, '¥'], [0x36, '¤'], [0x37, '¦'],
  [0x38, 'Å'], [0x39, 'å'], [0x3a, 'Ø'], [0x3b, 'ø'], [0x3c, '+'], [0x3d, '+'],
  [0x3e, '+'], [0x3f, '+'],
]);
