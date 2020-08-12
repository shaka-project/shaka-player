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
     * The pen points to the position that an incoming character will occupy.
     * @public {!shaka.cea.Cea708Pen}
     */
    this.pen_ = new shaka.cea.Cea708Pen();

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
     * If valid, ranges from 0 to 8, specifying one of 9 locations on screen:
     * 0________1________2
     * |        |        |
     * 3________4________5
     * |        |        |
     * 6________7________8
     * Diagram is valid as per CEA-708-E section 8.4.4.
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
    shaka.util.Functional.ignored(this.verticalAnchor_, this.toggleRelative_,
        this.horAnchor_, this.anchorId_, this.fillColor_);
  }

  /**
   * @param {!boolean} visible
   * @param {!number} verticalAnchor
   * @param {!boolean} toggleRelative
   * @param {!number} horAnchor
   * @param {!number} rowCount
   * @param {!number} anchorId
   * @param {!number} colCount
   */
  update(visible, verticalAnchor,
      toggleRelative, horAnchor, rowCount, anchorId, colCount) {
    this.visible_ = visible;
    this.verticalAnchor_ = verticalAnchor;
    this.toggleRelative_ = toggleRelative;
    this.horAnchor_ = horAnchor;
    this.rowCount_ = rowCount;
    this.anchorId_ = anchorId;
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
   * @param {!string} char
   */
  setCharacter(char) {
    const pen = this.pen_;
    // Check if the pen is out of bounds.
    if (pen.getColLocation() >= this.colCount_) {
      return;
    }

    if (pen.getRowLocation() >= this.rowCount_) {
      return;
    }

    const cea708Char = new shaka.cea.Cea708Window.Char(char, pen);
    this.memory_[pen.getRowLocation()][pen.getColLocation()] = cea708Char;

    // Increment column
    pen.setColLocation(pen.getColLocation()+1);
    // this.debugMemory(); TODO remove
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
      // Move pen back a row.
      this.pen_.setColLocation(shaka.cea.Cea708Window.MAX_COLS - 1);
      this.pen_.setRowLocation(this.pen_.getRowLocation()-1);
    } else {
      // Move pen back a column.
      this.pen_.setColLocation(this.pen_.getColLocation()-1);
    }

    // Erase the character occupied at that position.
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

  /* debugMemory() {
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
  }*/

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
          text += char.getCharacter();
        }
      }
      text+='\n';
    }
    text = text.trim();
    shaka.log.info('text: '+text);

    if (text) {
      const topLevelCue = new shaka.text.Cue(this.startTime_, endTime, '');
      const region = new shaka.text.CueRegion();
      // We will make the region id equal to CEA-708 window number.
      region.id = this.windowNum_.toString();

      const anchorPercentages = [0, 50, 100];
      region.regionAnchorX = anchorPercentages[Math.floor(this.anchorId_ / 3)];
      region.regionAnchorY = anchorPercentages[this.anchorId_ % 3];

      shaka.log.info('anchor id: '+this.anchorId_);
      shaka.log.info('relative is '+this.toggleRelative_);
      region.height = 50;
      region.width = 300;
      region.viewportAnchorX = 50;
      region.viewportAnchorY = 50;
      region.regionAnchorX = 50;
      region.regionAnchorY = 100;

      region.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;
      region.widthUnits = shaka.text.CueRegion.units.PX;
      topLevelCue.region = region;

      const nestedCue = this.createCue_(this.startTime_, endTime, text);
      topLevelCue.nestedCues.push(nestedCue);

      return {
        stream: `svc${this.serviceNumber_}`,
        cue: topLevelCue,
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

    // Default textAlign is "CENTER".
    if (this.justification_ === 0) {
      // LEFT justified.
      cue.textAlign = shaka.text.Cue.textAlign.LEFT;
    } else if (this.justification_ === 1) {
      // RIGHT justified.
      cue.textAlign = shaka.text.Cue.textAlign.RIGHT;
    }


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
   * @param {!string} char
   * @param {!shaka.cea.Cea708Pen} pen
   */
  constructor(char, pen) {
    /**
     * @private {!string}
     */
    this.char_ = char;

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
   * @return {!string}
   */
  getCharacter() {
    return this.char_;
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
