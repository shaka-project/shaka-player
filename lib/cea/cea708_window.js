/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Window');

goog.require('shaka.cea.CeaDecoderUtils');

/**
 * CEA-708 Window. Each CEA-708 service owns 8 of these.
 */
shaka.cea.Cea708Window = class {
  /**
   * @param {!number} windowNum
   */
  constructor(windowNum) {
    /**
     * A number from 0 - 7 indicating the window number in the
     * service that owns this window.
     * @private {!number}
     */
    this.windowNum_ = windowNum;

    /**
     * @private {!boolean}
     */
    this.visible_ = false;

    /**
     * @private {!boolean}
     */
    this.relativeToggle_ = false;

    /**
     * Horizontal anchor. Loosely corresponds to a WebVTT viewport X anchor.
     * @private {!number}
     */
    this.horAnchor_ = 0;

    /**
     * Vertical anchor. Loosely corresponds to a WebVTT viewport Y anchor.
     * @private {!number}
     */
    this.verticalAnchor_ = 0;

    /**
     * If valid, ranges from 0 to 8, specifying one of 9 locations on window:
     * 0________1________2
     * |        |        |
     * 3________4________5
     * |        |        |
     * 6________7________8
     * Diagram is valid as per CEA-708-E section 8.4.4.
     * Each of these locations corresponds to a WebVTT region's "region anchor".
     * @private {!number}
     */
    this.anchorId_ = 0;

    /**
     * @private {!number}
     */
    this.rowCount_ = 0;

    /**
     * @private {!number}
     */
    this.colCount_ = 0;

    /**
     * LEFT -> 0, RIGHT -> 1, CENTER -> 2, FULL -> 3
     * Center by default.
     * @private {!number}
     */
    this.justification_ = 2;

    /**
     * @private {!Array<!Array<?shaka.cea.CeaDecoderUtils.StyledChar>>}
     */
    this.memory_ = [];

    /**
     * @private {!number}
     */
    this.startTime_ = 0;

    /**
     * Row that the current pen is pointing at.
     * @private {!number}
     */
    this.row_ = 0;

    /**
     * Column that the current pen is pointing at.
     * @private {!number}
     */
    this.col_ = 0;

    /**
     * Indicates whether the current pen position is italicized.
     * @private {!boolean}
     */
    this.italics_ = false;

    /**
     * Indicates whether the current pen position is underlined.
     * @private {!boolean}
     */
    this.underline_ = false;

    /**
     * Indicates the text color at the current pen position.
     * @private {!string}
     */
    this.textColor_ = shaka.cea.CeaDecoderUtils.DEFAULT_TXT_COLOR;

    /**
     * Indicates the background color at the current pen position.
     * @private {!string}
     */
    this.backgroundColor_ = shaka.cea.CeaDecoderUtils.DEFAULT_BG_COLOR;

    this.resetMemory();

    // TODO Support window positioning by mapping them to Regions.
    // https://dvcs.w3.org/hg/text-tracks/raw-file/default/608toVTT/608toVTT.html#positioning-in-cea-708
    shaka.util.Functional.ignored(this.verticalAnchor_, this.relativeToggle_,
        this.horAnchor_, this.anchorId_, this.windowNum_);
  }

  /**
   * @param {!boolean} visible
   * @param {!number} verticalAnchor
   * @param {!number} horAnchor
   * @param {!number} anchorId
   * @param {!boolean} relativeToggle
   * @param {!number} rowCount
   * @param {!number} colCount
   */
  defineWindow(visible, verticalAnchor, horAnchor, anchorId,
      relativeToggle, rowCount, colCount) {
    this.visible_ = visible;
    this.verticalAnchor_ = verticalAnchor;
    this.horAnchor_ = horAnchor;
    this.anchorId_ = anchorId;
    this.relativeToggle_ = relativeToggle;
    this.rowCount_ = rowCount;
    this.colCount_ = colCount;
  }

  /**
   * Resets the memory buffer.
   */
  resetMemory() {
    this.memory_ = [];
    for (let i = 0; i < shaka.cea.Cea708Window.MAX_ROWS; i++) {
      this.memory_.push(this.createNewRow_());
    }
  }

  /**
   * Allocates and returns a new row.
   * @return {!Array<?shaka.cea.CeaDecoderUtils.StyledChar>}
   * @private
   */
  createNewRow_() {
    const row = [];
    for (let j = 0; j < shaka.cea.Cea708Window.MAX_COLS; j++) {
      row.push(null);
    }
    return row;
  }

  /**
   * Sets the unicode value for a char at the current pen location.
   * @param {!string} char
   */
  setCharacter(char) {
    // Check if the pen is out of bounds.
    if (!this.isPenInBounds_()) {
      return;
    }

    const cea708Char = new shaka.cea.CeaDecoderUtils.StyledChar(
        char, this.underline_, this.italics_,
        this.backgroundColor_, this.textColor_);
    this.memory_[this.row_][this.col_] = cea708Char;

    // Increment column
    this.col_ ++;
  }

  /**
   * Erases a character from the buffer and moves the pen back.
   */
  backspace() {
    if (!this.isPenInBounds_()) {
      return;
    }

    // Check if a backspace can be done.
    if (this.col_ <= 0 && this.row_ <= 0) {
      return;
    }

    if (this.col_ <= 0) {
      // Move pen back a row.
      this.col_ = this.colCount_ - 1;
      this.row_--;
    } else {
      // Move pen back a column.
      this.col_--;
    }

    // Erase the character occupied at that position.
    this.memory_[this.row_][this.col_] = null;
  }

  /**
   * @private
   */
  isPenInBounds_() {
    const inRowBounds = this.row_ < this.rowCount_ && this.row_ >= 0;
    const inColBounds = this.col_ < this.colCount_ && this.col_ >= 0;
    return inRowBounds && inColBounds;
  }

  /**
   * @return {!boolean}
   */
  isVisible() {
    return this.visible_;
  }

  /**
   * Moves up <count> rows in the buffer.
   * @param {!number} count
   * @private
   */
  moveUpRows_(count) {
    let dst = 0; // Row each row should be moved to.

    // Move existing rows up by <count>.
    for (let i = count; i < shaka.cea.Cea708Window.MAX_ROWS; i++, dst++) {
      this.memory_[dst] = this.memory_[i];
    }

    // Create <count> new rows at the bottom.
    for (let i = 0; i < count; i++, dst++) {
      this.memory_[dst] = this.createNewRow_();
    }
  }

  /**
   * Handles CR. Increments row - if last row, "roll up" all rows by one.
   */
  carriageReturn() {
    if (this.row_ + 1 >= this.rowCount_) {
      this.moveUpRows_(1);
      this.col_ = 0;
      return;
    }

    this.row_++;
    this.col_ = 0;
  }

  /**
   * Handles HCR. Moves the pen to the beginning of the cur. row and clears it.
   */
  horizontalCarriageReturn() {
    this.memory_[this.row_] = this.createNewRow_();
    this.col_ = 0;
  }

  /**
   * @param {!number} endTime
   * @param {!number} serviceNumber Number of the service emitting this caption.
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   */
  forceEmit(endTime, serviceNumber) {
    const stream = `svc${serviceNumber}`;
    const topLevelCue = new shaka.text.Cue(
        this.startTime_, endTime, /* payload= */ '');

    if (this.justification_ === 0) {
      // LEFT justified.
      topLevelCue.textAlign = shaka.text.Cue.textAlign.LEFT;
    } else if (this.justification_ === 1) {
      // RIGHT justified.
      topLevelCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
    }

    const caption = shaka.cea.CeaDecoderUtils.getParsedCaption(
        topLevelCue, stream, this.memory_, this.startTime_, endTime);
    if (caption) {
      this.setStartTime(endTime);
    }
    return caption;
  }

  /**
   * @param {!number} row
   * @param {!number} col
   */
  setPenLocation(row, col) {
    this.row_ = row;
    this.col_ = col;
  }

  /**
   * @param {!string} backgroundColor
   */
  setPenBackgroundColor(backgroundColor) {
    this.backgroundColor_ = backgroundColor;
  }

  /**
   * @param {!string} textColor
   */
  setPenTextColor(textColor) {
    this.textColor_ = textColor;
  }

  /**
   * @param {!boolean} underline
   */
  setPenUnderline(underline) {
    this.underline_ = underline;
  }

  /**
   * @param {!boolean} italics
   */
  setPenItalics(italics) {
    this.italics_ = italics;
  }

  resetPen() {
    this.row_ = 0;
    this.col_ = 0;
    this.underline_ = false;
    this.italics_ = false;
    this.textColor_ = 'white';
    this.backgroundColor_ = 'black';
  }

  /**
   * @param {!number} justification
   */
  setJustification(justification) {
    this.justification_ = justification;
  }

  /**
   * Sets the window to visible.
   */
  display() {
    this.visible_ = true;
  }

  /**
   * Sets the window to invisible.
   */
  hide() {
    this.visible_ = false;
  }

  /**
   * Toggles the visibility of the window.
   */
  toggle() {
    this.visible_ = !this.visible_;
  }

  /**
   * Sets the start time for the cue to be emitted.
   * @param {!number} pts
   */
  setStartTime(pts) {
    this.startTime_ = pts;
  }
};

/**
 * Can be indexed 0-31 for 4:3 format, and 0-41 for 16:9 formats.
 * Thus the absolute maximum is 42 columns for the 16:9 format.
 * @private @const {!number}
 */
shaka.cea.Cea708Window.MAX_COLS = 42;

/**
 * Maximum of 15 rows that can be indexed from 0 to 14.
 * @private @const {!number}
 */
shaka.cea.Cea708Window.MAX_ROWS = 15;
