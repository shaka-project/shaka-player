/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Window');

/**
 * CEA-708 Window. Each CEA-708 service owns 8 of these.
 */
shaka.cea.Cea708Window = class {
  /**
   * @param {!number} serviceNumber
   * @param {!number} windowNum
   */
  constructor(serviceNumber, windowNum) {
    /**
     * Service number of the service that owns this window.
     * @private {!number}
     */
    this.serviceNumber_ = serviceNumber;

    /**
     * A number from 0 - 7 indicating the window number.
     * @private {!number}
     */
    this.windowNum_ = windowNum;

    /**
     * Cea708 Pen, as defined by the spec.
     * @public {!shaka.cea.Cea708Pen}
     */
    this.pen_ = new shaka.cea.Cea708Pen();

    /**
     * @private {!boolean}
     */
    this.columnLock_ = false;

    /**
     * @private {!boolean}
     */
    this.rowLock_ = false;

    /**
     * @private {!boolean}
     */
    this.visible_ = false;

    /**
     * @private {!number}
     */
    this.verticalAnchor_ = 0;

    /**
     * @private {!boolean}
     */
    this.toggleRelative_ = false;

    /**
     * @private {!number}
     */
    this.horAnchor_ = 0;

    /**
     * @private {!number}
     */
    this.rowCount_ = 0;

    /**
     * @private {!number}
     */
    this.anchorId_ = 0;

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
     * @private {!string}
     */
    this.fillColor_ = '#000000';

    /**
     * @private {!Array<!Array<?shaka.cea.Cea708Window.Char>>}
     */
    this.memory_ = [];

    /**
     * @private {!number}
     */
    this.startTime_ = 0;

    this.resetMemory();
    shaka.util.Functional.ignored(this.verticalAnchor_, this.toggleRelative_, this.horAnchor_, this.anchorId_, this.fillColor_);
  }

  /**
   * @param {!boolean} columnLock
   * @param {!boolean} rowLock
   * @param {!boolean} visible
   * @param {!number} verticalAnchor
   * @param {!boolean} toggleRelative
   * @param {!number} horAnchor
   * @param {!number} rowCount
   * @param {!number} anchorId
   * @param {!number} colCount
   */
  update(columnLock, rowLock, visible, verticalAnchor,
      toggleRelative, horAnchor, rowCount, anchorId, colCount) {
    this.columnLock_ = columnLock;
    this.rowLock_ = rowLock;
    this.visible_ = visible;
    this.verticalAnchor_ = verticalAnchor;
    this.toggleRelative_ = toggleRelative;
    this.horAnchor_ = horAnchor;
    this.rowCount_ = rowCount;
    this.anchorId_ = anchorId;
    this.colCount_ = colCount;
  }

  /**
   * Resets the memory.
   */
  resetMemory() {
    this.memory_ = [];
    for (let i = 0; i < shaka.cea.Cea708Window.MAX_ROWS; i++) {
      this.memory_.push(this.createNewRow_());
    }
  }

  /**
   * Allocates and returns a new row.
   * @return {!Array<?shaka.cea.Cea708Window.Char>}
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
   * @param {!number} unicodeValue
   */
  setCharacter(unicodeValue) {
    const pen = this.pen_;
    // Check if the pen is out of bounds, and if it's allowed to be.
    if (pen.getColLocation() >= shaka.cea.Cea708Window.MAX_COLS &&
        !this.rowLock_) {
      pen.setRowLocation(pen.getRowLocation()+1);
      pen.setColLocation(0);
    }

    // Out of the range of current columns, and not allowed to extend
    if (pen.getColLocation() >= this.colCount_ && this.columnLock_) {
      return;
    }

    // Ensure we are still within the row boundaries.
    if (pen.getRowLocation() >= this.rowCount_) {
      // This should never happen, and is an error.
      return;
    }
    const char =
        new shaka.cea.Cea708Window.Char(unicodeValue, pen);
    this.memory_[pen.getRowLocation()][pen.getColLocation()] = char;

    // Increment column
    pen.setColLocation(pen.getColLocation()+1);
    this.debugMemory();
  }

  /**
   * Erases a character from the buffer and moves the pen back.
   */
  backspace() {
    // Check if a backspace can be done.
    if (this.pen_.getColLocation() <= 0 && this.pen_.getRowLocation() <= 0) {
      return;
    }

    if (this.pen_.getColLocation() <= 0) {
      // Word wrap is on otherwise this would have exited. Move pen back a row.
      this.pen_.setColLocation(shaka.cea.Cea708Window.MAX_COLS - 1);
      this.pen_.setRowLocation(this.pen_.getRowLocation()-1);
    } else {
      this.pen_.setColLocation(this.pen_.getColLocation()-1);
    }

    this.memory_[this.pen_.getRowLocation()][this.pen_.getColLocation()] = null;
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
    if (this.pen_.getRowLocation() + 1 >= this.rowCount_) {
      this.moveUpRows_(1);
      this.pen_.setColLocation(0);
      return;
    }

    this.pen_.setRowLocation(this.pen_.getRowLocation()+1);
    this.pen_.setColLocation(0);
  }

  /**
   * Handles HCR. Moves the pen to the beginning of the cur. row and clears it.
   */
  horizontalCarriageReturn() {
    this.memory_[this.pen_.getRowLocation()] = this.createNewRow_();
    this.pen_.setColLocation(0);
  }

  debugMemory() {
    let debugString = '';
    for (let i = 0; i < this.rowCount_; i++) {
      for (let j = 0; j < shaka.cea.Cea708Window.MAX_COLS; j++) {
        const char = this.memory_[i][j];
        if (char === null) {
          debugString += '_';
        } else {
          debugString += String.fromCharCode(char.getUtfValue());
        }
      }
      debugString+='\n';
    }
    shaka.log.info('debugging window '+this.windowNum_);
    shaka.log.info(debugString);
  }

  /**
   * @param {!number} endTime
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   */
  forceEmit(endTime) {
    if (!this.memory_.length) {
      return null;
    }

    let text = '';
    for (let i = 0; i < shaka.cea.Cea708Window.MAX_ROWS; i++) {
      for (let j = 0; j < shaka.cea.Cea708Window.MAX_COLS; j++) {
        const char = this.memory_[i][j];
        if (char !== null) {
          text += String.fromCharCode(char.getUtfValue());
        }
      }
      text+='\n';
    }
    text = text.trim();
    shaka.log.info('text: '+text);

    if (text) {
      const cue = this.createCue_(this.startTime_, endTime, text);
      return {
        stream: `svc${this.serviceNumber_}`,
        cue,
      };
    }
    return null;
  }

  /**
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!string} text
   * @return {!shaka.text.Cue}
   * @private
   */
  createCue_(startTime, endTime, text) {
    const cue = new shaka.text.Cue(startTime, endTime, text);

    // Default textAlign is "CENTER". Check if we need to change this.
    if (this.justification_ === 0) {
      // LEFT justified.
      cue.textAlign = shaka.text.Cue.textAlign.LEFT;
    } else if (this.justification_ === 1) {
      // RIGHT justified.
      cue.textAlign = shaka.text.Cue.textAlign.RIGHT;
    }
    const region = new shaka.text.CueRegion();
    cue.region = region;

    return cue;
  }

  /**
   * @return {!shaka.cea.Cea708Pen}
   */
  getPen() {
    return this.pen_;
  }

  resetPen() {
    this.pen_ = new shaka.cea.Cea708Pen();
  }

  /**
   * @param {!number} justification
   * @param {!string} fillColor
   */
  setAttributes(justification, fillColor) {
    this.justification_ = justification;
    this.fillColor_ = fillColor;
  }

  /**
   * Clears text from the window.
   */
  clear() {
    shaka.log.info('clear called!');
    this.resetMemory();
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


shaka.cea.Cea708Window.Char = class {
  /**
   * @param {!number} utfValue
   * @param {!shaka.cea.Cea708Pen} pen
   */
  constructor(utfValue, pen) {
    /**
     * @private {!number}
     */
    this.utfValue_ = utfValue;

    /**
     * @private {!boolean}
     */
    this.underline_ = pen.getUnderline();

    /**
     * @private {!boolean}
     */
    this.italics_ = pen.getItalics();

    /**
     * @private {!string}
     */
    this.textColor_ = pen.getTextColor();

    /**
     * @private {!string}
     */
    this.backgroundColor_ = pen.getBackgroundColor();
  }

  /**
   * @return {!number}
   */
  getUtfValue() {
    return this.utfValue_;
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
  getTextColor() {
    return this.textColor_;
  }

  /**
   * @return {!string}
   */
  getBackgroundColor() {
    return this.backgroundColor_;
  }
};

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Window.MAX_COLS = 32;

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Window.MAX_ROWS = 16;
