/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Decoder');

/**
 * 708 closed captions decoder.
 */
shaka.cea.Cea708Decoder = class {
  constructor() {
    /**
       * Contains all bytes in the current CEA-708 DTVCC packet being processed.
       * @private {!Array<!number>}
       */
    this.currentPacket_ = [];

    /**
       * Holds a reader to the current packet.
       * @private {!shaka.util.DataViewReader}
       */
    this.packetReader_ = this.getReaderFromCurrentPacket();

    /**
     * Current caption text.
     * @private {!string}
     */
    this.currentText_ = '';

    /**
     * Eight Cea708 Windows, as defined by the spec.
     * @private {!Array<?shaka.cea.Cea708Decoder.Window>}
     */
    this.windows_ = [
      null, null, null, null, null, null, null, null,
    ];

    /**
     * The current window for which window command operate on.
     * @private {?shaka.cea.Cea708Decoder.Window}
     */
    this.currentWindow_ = null;

    shaka.util.Functional.ignored(this.currentWindow_);
  }

  /**
     * @return {!shaka.util.DataViewReader}
     */
  getReaderFromCurrentPacket() {
    const dtvccBytes = new Uint8Array(this.currentPacket_);
    return new shaka.util.DataViewReader(
        dtvccBytes, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
  }

  clearPacket() {
    this.currentPacket_ = [];
  }

  /**
     * @param {...!number} bytes
     */
  addBytes(...bytes) {
    this.currentPacket_.push(...bytes);
  }

  /**
     * Processes a DTVCC data series.
     */
  processDtvccData() {
    this.packetReader_ = this.getReaderFromCurrentPacket();
    const reader = this.packetReader_;
    if (!reader.hasMoreData()) {
      return;
    }

    // 2 bits sequence number
    // 6 bits packet size, 64 if packet size == 0
    const packetInfo = reader.readUint8();
    // const sequenceNumber = (packetInfo & 0xb0) >> 6;
    let packetSize = packetInfo & 0x3f;
    if (packetSize === 0) {
      packetSize = 64;
    }

    // Next packetSize*2-1 bytes contain service block packets,
    for (let j = 0; j < packetSize * 2 - 1 && reader.hasMoreData(); j++) {
      const serviceBlockByte = reader.readUint8();
      // 3 bits service number, 5 bits block size
      let serviceNumber = (serviceBlockByte & 0xe) >> 5;
      const blockSize = serviceBlockByte & 0x1f;

      // If service number is 7, read the extended service number.
      if (serviceNumber === 0x07) {
        const extendedServiceNumber = reader.readUint8() & 0x3f;
        serviceNumber = extendedServiceNumber; // Todo does it replace servicenumber or add to it?
      }

      // Read `blockSize` bytes, or until the buffer end (whichever comes first)
      for (let k = 0; k < blockSize && reader.hasMoreData(); k++) {
        let controlCode = reader.readUint8();
        if (controlCode === shaka.cea.Cea708Decoder.EXT_CEA708_CTRL_CODE_BYTE1) {
          const extendedControl = reader.readUint8();
          controlCode = (controlCode << 8) | extendedControl;
        }
        this.handleCea708ControlCode_(controlCode);
      }
    }
  }

  /**
     * Processes a CEA-708 control code.
     * @param {!number} controlCode
     * @private
     */
  handleCea708ControlCode_(controlCode) {
    shaka.log.info('control code! '+controlCode.toString(16));
    if (controlCode >= 0x00 && controlCode <= 0x1f) {
      shaka.log.info('C0');
      this.handleC0_(controlCode);
    } else if (controlCode >= 0x80 && controlCode <= 0x9f) {
      // shaka.log.info('C1');
      this.handleC1_(controlCode);
    } else if (controlCode >= 0x1000 && controlCode <= 0x101f) {
      this.handleC2_(controlCode);
    } else if (controlCode >= 0x1080 && controlCode <= 0x109f) {
      this.handleC3_(controlCode);
    } else if (controlCode >= 0x20 && controlCode <= 0x7f) {
      // shaka.log.info('G0');
      this.handleG0_(controlCode);
    } else if (controlCode >= 0xa0 && controlCode <= 0xff) {
      shaka.log.info('G1');
    } else if (controlCode >= 0x1020 && controlCode <= 0x107f) {
      shaka.log.info('G2');
    } else if (controlCode >= 0x10a0 && controlCode <= 0x10ff) {
      shaka.log.info('G3');
    }
  }

  /**
     * Handles G0 group data.
     * @param {!number} controlCode
     * @private
     */
  handleG0_(controlCode) {
    // G0 contains ASCII from 0x20 to 0x7f, with the exception that 0x7f
    // is replaced by a musical note.
    shaka.log.info('G0 control code: '+controlCode);
    if (controlCode === 0x7f) {
      this.currentWindow_.setCharacter(0x266A);
    } else {
      shaka.log.info(controlCode.toString(16)+' '+String.fromCharCode(controlCode));
      this.currentWindow_.setCharacter(controlCode);
    }
  }

  /**
     * Handles C0 group data.
     * @param {!number} controlCode
     * @private
     */
  handleC0_(controlCode) {
    // ASCII Backspace (Unicode aware)
    if (controlCode === 0x08) {
      this.currentText_ = Array.from(this.currentText_).slice(0, -1).join('');
    } else if (controlCode == 0x03) {
      this.endOfText_();
    } else if (controlCode == 0x0d) {
      shaka.log.info('carriage return');
    }
  }

  /**
     * Handles C2 group data.
     * @param {!number} controlCode
     * Currently no commands on the C2 table in spec, but if this is seen,
     * then the appropriate number of bytes must be skipped
     * @private
     */
  handleC2_(controlCode) {
    const reader = this.packetReader_;

    // This is an extended control code, so get the last 2 bytes
    controlCode &= 0xff;
    if (controlCode >= 0x08 && controlCode <= 0x0f) {
      reader.skip(1);
    } else if (controlCode >= 0x10 && controlCode <= 0x17) {
      reader.skip(2);
    } else if (controlCode >= 0x18 && controlCode <= 0x1f) {
      reader.skip(3);
    }
  }

  /**
     * Handles C2 group data.
     * @param {!number} controlCode
     * Currently no commands on the C3 table in spec, but if this is seen,
     * then the appropriate number of bytes must be skipped
     * @private
     */
  handleC3_(controlCode) {
    const reader = this.packetReader_;

    // This is an extended control code, so get the last 2 bytes
    controlCode &= 0xff;
    if (controlCode >= 0x80 && controlCode <= 0x87) {
      reader.skip(4);
    } else if (controlCode >= 0x80 && controlCode <= 0x8f) {
      reader.skip(5);
    }
  }

  /**
     * Processes C1 group data.
     * These are caption commands.
     * @param {!number} controlCode
     * @private
     */
  handleC1_(controlCode) {
    shaka.log.info('control Code:' +controlCode.toString(16));
    if (controlCode >= 0x80 && controlCode <= 0x87) {
      const windowNum = controlCode & 0x07;
      this.setCurrentWindow(windowNum);
    } else if (controlCode === 0x88) {
      this.clearWindows();
    } else if (controlCode === 0x89) {
      this.displayWindows();
    } else if (controlCode === 0x8a) {
      this.hideWindows();
    } else if (controlCode === 0x8b) {
      this.toggleWindows();
    } else if (controlCode === 0x8c) {
      this.deleteWindows();
    } else if (controlCode === 0x8d) {
      this.delay();
    } else if (controlCode === 0x8e) {
      this.cancelDelay();
    } else if (controlCode === 0x8f) {
      this.reset();
    } else if (controlCode === 0x90) {
      this.setPenAttributes();
    } else if (controlCode === 0x91) {
      this.setPenColor();
    } else if (controlCode === 0x92) {
      this.setPenLocation();
    } else if (controlCode === 0x97) {
      this.setWindowAttributes();
    } else if (controlCode >= 0x98 && controlCode <= 0x9f) {
      const windowNum = (controlCode & 0x0f) - 8;
      this.defineWindow(windowNum);
    }
  }

  /**
     * ETX command, flushes text to the current window.
     * @private
     */
  endOfText_() {
    shaka.log.info('end of text');
  }

  /**
   * @param {!number} windowNum
   */
  setCurrentWindow(windowNum) {
    // If the window isn't created, ignore the command.
    if (!this.windows_[windowNum]) {
      return;
    }
    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Yields an iterator with all the windows specified in the 8-bit bitmap.
   * @param {!number} bitmap
   * @return {!Iterable.<!shaka.cea.Cea708Decoder.Window>}
   * @private
   */
  * getSpecifiedWindows_(bitmap) {
    for (let i = 0; i < 8; i++) {
      const windowSpecified = bitmap & 0x01;
      const window = this.windows_[i];
      if (windowSpecified && window) {
        yield window;
      }
    }
  }

  clearWindows() {
    // Clears windows from the 8 bit bitmap.
    const windowsBitmap = this.packetReader_.readUint8();
    for (const window of this.getSpecifiedWindows_(windowsBitmap)) {
      window.clear();
    }
  }

  displayWindows() {
    // Displays windows from the 8 bit bitmap.
    const windowsBitmap = this.packetReader_.readUint8();
    for (const window of this.getSpecifiedWindows_(windowsBitmap)) {
      window.display();
    }
  }

  hideWindows() {
    // Hides windows from the 8 bit bitmap.
    const windowsBitmap = this.packetReader_.readUint8();
    for (const window of this.getSpecifiedWindows_(windowsBitmap)) {
      window.hide();
    }
  }

  toggleWindows() {
    // Toggles windows from the 8 bit bitmap.
    const windowsBitmap = this.packetReader_.readUint8();
    for (const window of this.getSpecifiedWindows_(windowsBitmap)) {
      window.toggle();
    }
  }

  deleteWindows() {
    shaka.log.info('delete windows called!');
    // Deletes windows from the 8 bit bitmap.
    const windowsBitmap = this.packetReader_.readUint8();
    for (let i = 0; i < 8; i++) {
      const windowSpecified = windowsBitmap & 0x01;
      if (windowSpecified) {
        this.windows_[i] = null;
      }
    }
  }

  delay() {
    this.packetReader_.readUint8();
  }

  cancelDelay() {}

  reset() {}

  setPenAttributes() {
    // Following 2 bytes take the following form:
    // b1 = |TXT_TAG|OFS|PSZ| , b2 = |I|U|EDTYP|FNTAG|
    // We are only concerned with the info in byte 2 for this decoder.

    this.packetReader_.skip(1); // Skip first byte
    const attrByte2 = this.packetReader_.readUint8();

    if (!this.currentWindow_) {
      return;
    }

    const toggleItalics = (attrByte2 & 0x80) > 0;
    const toggleUnderline = (attrByte2 & 0x40) > 0;
    const fontTag = attrByte2 & 0x07;

    if (toggleItalics) {
      this.currentWindow_.pen.toggleItalics();
    }
    if (toggleUnderline) {
      this.currentWindow_.pen.toggleUnderline();
    }
    this.currentWindow_.pen.setFontTag(fontTag);
  }

  setPenColor() {
    this.packetReader_.skip(3);
  }

  setPenLocation() {
    // Following 2 bytes take the following form:
    // b1 = |0|0|0|0|ROW| and b2 = |0|0|COLUMN|
    const locationByte1 = this.packetReader_.readUint8();
    const locationByte2 = this.packetReader_.readUint8();
    if (!this.currentWindow_) {
      return;
    }

    const row = locationByte1 & 0x0f;
    const col = locationByte2 & 0x3f;
    shaka.log.info(`set pen location called (${row},${col})`);
    this.currentWindow_.pen.setLocation(row, col);
  }

  setWindowAttributes() {
    // 4 bytes follow, with the following form:
    // b1 = |FOP|F_R|F_G|F_B|, b2 = |BTP|B_R|B_G|B_B|
    // b3 = |W|B|PRD|SCD|JST|, b4 = |EFT_SPD|EFD|DEF|
    const reader = this.packetReader_;
    const b1 = reader.readUint8();
    reader.skip(1); // Border colors not supported.
    const b3 = reader.readUint8();
    reader.skip(1); // Effects not supported.

    if (!this.currentWindow_) {
      return;
    }

    const fillBlue= b1 & 0x03;
    const fillGreen = (b1 & 0x0b) >> 2;
    const fillRed = (b1 & 0x30) >> 4;
    const fillColor = new shaka.cea.Cea708Decoder.Color(
        fillRed, fillGreen, fillBlue);

    const justification = b3 & 0x07;

    this.currentWindow_.setAttributes(justification, fillColor);
  }

  /**
   * @param {!number} windowNum
   */
  defineWindow(windowNum) {
    shaka.log.info('define window: '+windowNum);
    // 6 Bytes follow, with the following form:
    // b1 = |0|0|V|R|C|PRIOR|, b2 = |P|VERT_ANCHOR|, b3 = |HOR_ANCHOR|
    // b1 = |ANC_ID|ROW_CNT|, b2 = |0|0|COL_COUNT|, b3 = |0|0|WNSTY|PNSTY|
    const reader = this.packetReader_;
    const windowAlreadyExists = this.windows_[windowNum] != null;
    this.windows_[windowNum] = new shaka.cea.Cea708Decoder.Window();

    const b1 = reader.readUint8();
    const b2 = reader.readUint8();
    const b3 = reader.readUint8();
    const b4 = reader.readUint8();
    const b5 = reader.readUint8();
    const b6 = reader.readUint8();

    const priority = b1 & 0x07;
    const columnLock = (b1 & 0x08) > 0;
    const rowLock = (b1 & 0x10) > 0;
    const visible = (b1 & 0x20) > 0;
    const verticalAnchor = b2 & 0x7f;
    const toggleRelative = b2 & 0x80;
    const horAnchor = b3;
    const rowCount = (b4 & 0x0f) + 1; // 0 -> 1 , 1 -> 2, etc. so add 1.
    const anchorId = (b4 & 0xf0) >> 4;
    const colCount = (b5 & 0x3f) + 1;

    // If 0, set default pen style 1 for new windows and prev. pen style for
    // existing windows. Otherwise, use predefined pen styles.
    const penStyle = b6 & 0x07;
    shaka.log.info(penStyle);
    shaka.log.info(windowAlreadyExists);
    if ((windowAlreadyExists && penStyle === 1) ||
        !windowAlreadyExists) {
      this.windows_[windowNum].resetPen();
    }
    shaka.log.info('row lock:'+rowLock+' column lock:'+ columnLock);

    this.windows_[windowNum].reset(priority, columnLock, rowLock,
        visible, verticalAnchor, toggleRelative, horAnchor,
        rowCount, anchorId, colCount);
    // If 0, set default window style 1 for new windows and prev. window
    // style for existing windows. Otherwise, use predefined pen styles.
    // const windowStyle = (b6 & 0x38) >> 3;

    // If the current window is null, set this window as the current window
    this.currentWindow_ = this.windows_[windowNum];
  }
};

shaka.cea.Cea708Decoder.Pen = class {
  constructor() {
    /**
     * The row that the pen is currently pointing at.
     * @private {!number}
     */
    this.rowLocation_ = 0;

    /**
     * The column that the pen is currently pointing at.
     * @private {!number}
     */
    this.colLocation_ = 0;

    /**
     * @private {!boolean}
     */
    this.italics_ = false;

    /**
     * @private {!boolean}
     */
    this.underline_ = false;

    /**
     * @private {!number}
     */
    this.fontTag_ = 0; // Default

    /**
     * @private {!shaka.cea.Cea708Decoder.Color}
     */
    this.color_ = new shaka.cea.Cea708Decoder.Color(0, 0, 0);

    shaka.util.Functional.ignored(
        this.rowLocation_, this.colLocation_, this.fontTag_, this.color_);
  }

  /**
   */
  toggleItalics() {
    this.italics_ = !this.italics_;
  }

  /**
   */
  toggleUnderline() {
    this.underline_ = !this.underline_;
  }

  /**
   * @param {!number} tag
   */
  setFontTag(tag) {
    this.fontTag_ = tag;
  }

  /**
   * @param {!number} row
   * @param {!number} col
   */
  setLocation(row, col) {
    this.rowLocation_ = row;
    this.colLocation_ = col;
  }

  /**
   * @param {!shaka.cea.Cea708Decoder.Color} color
   */
  setColor(color) {
    this.color_ = color;
  }
};


shaka.cea.Cea708Decoder.Window = class {
  constructor() {
    /**
     * Cea708 Pen, as defined by the spec.
     * @public {!shaka.cea.Cea708Decoder.Pen}
     */
    this.pen = new shaka.cea.Cea708Decoder.Pen();

    this.priority_ = 0;
    this.columnLock_ = 0;
    this.rowLock_ = 0;
    this.visible_ = 0;
    this.verticalAnchor_ = 0;
    this.toggleRelative_ = 0;
    this.horAnchor_ = 0;
    this.rowCount_ = 0;
    this.anchorId_ = 0;
    this.colCount_ = 0;
    this.justification_ = 0; // Left by default
    this.fillColor_ = new shaka.cea.Cea708Decoder.Color(0, 0, 0);
    this.maxColumnSize = 48; // As per the spec
    this.memory_ = [];
  }

  /**
   * @param {!number} priority
   * @param {!boolean} columnLock
   * @param {!boolean} rowLock
   * @param {!boolean} visible
   * @param {!number} verticalAnchor
   * @param {!number} toggleRelative
   * @param {!number} horAnchor
   * @param {!number} rowCount
   * @param {!number} anchorId
   * @param {!number} colCount
   */
  reset(priority, columnLock, rowLock,
      visible, verticalAnchor, toggleRelative, horAnchor,
      rowCount, anchorId, colCount) {
    this.priority_ = priority;
    this.columnLock_ = columnLock;
    this.rowLock_ = rowLock;
    this.visible_ = visible;
    this.verticalAnchor_ = verticalAnchor;
    this.toggleRelative_ = toggleRelative;
    this.horAnchor_ = horAnchor;
    this.rowCount_ = rowCount;
    this.anchorId_ = anchorId;
    this.colCount_ = colCount;
    this.memory_ = [];
    for (let i = 0; i < this.rowCount_; i++) {
      this.memory_.push([]);
      for (let j = 0; j < this.maxColumnSize; j++) {
        this.memory_[i].push(shaka.cea.Cea708Decoder.BLANK_CELL);
      }
    }
  }

  /**
   * Sets the unicode value for a char at the current pen location.
   * @param {!number} unicodeValue
   */
  setCharacter(unicodeValue) {
    // Check if the pen is out of bounds, and if it's allowed to be.
    if (this.pen.colLocation_ >= this.maxColumnSize && !this.rowLock_) {
      this.pen.rowLocation_++;
      this.pen.colLocation_ = 0;
    }

    // Out of the range of current columns, and not allowed to extend
    if (this.pen.colLocation_ >= this.colCount_ && this.columnLock_) {
      return;
    }

    // Ensure we are still within the row boundaries.
    if (this.pen.rowLocation_ >= this.rowCount_) {
      // This should never happen, and is an error.
      return;
    }
    shaka.log.info('pen column: '+this.pen.colLocation_);
    this.memory_[this.pen.rowLocation_][this.pen.colLocation_] = unicodeValue;
    this.pen.colLocation_++;
    this.debugMemory();
  }

  debugMemory() {
    let debugString = '';
    for (let i = 0; i < this.rowCount_; i++) {
      for (let j = 0; j < this.maxColumnSize; j++) {
        if (this.memory_[i][j] === shaka.cea.Cea708Decoder.BLANK_CELL) {
          debugString += '_';
        } else {
          debugString += String.fromCharCode(this.memory_[i][j]);
        }
      }
      debugString+='\n';
    }
    shaka.log.info(debugString);
  }

  resetPen() {
    this.pen = new shaka.cea.Cea708Decoder.Pen();
  }

  /**
   *
   * @param {!number} justification
   * @param {!shaka.cea.Cea708Decoder.Color} fillColor
   */
  setAttributes(justification, fillColor) {
    this.justification_ = justification;
    this.fillColor_ = fillColor;
  }

  clear() {}

  display() {}

  hide() {}

  toggle() {}
};

/**
 * 64 total colors, 4 parts of red, green, and blue
 */
shaka.cea.Cea708Decoder.Color = class {
  /**
   * @param {!number} red
   * @param {!number} green
   * @param {!number} blue
   */
  constructor(red, green, blue) {
    /**
     * @private {!number}
     */
    this.red = red;

    /**
     * @private {!number}
     */
    this.green = green;

    /**
     * @private {!number}
     */
    this.blue = blue;

    shaka.util.Functional.ignored(this.red, this.green, this.blue);
  }
};

/*
 * @enum {!number}

shaka.cea.Cea708Decoder.FontTag = {
  DEFAULT: 0,
  MONOSPACED_SERIF: 1,
  PROPORTIONAL_SERIF: 2,
  MONOSPACED_SANSERIF: 3,
  PROPORTIONAL_SANSERIF: 4,
  CASUAL: 5,
  CURSIVE: 6,
  SMALLCAPS: 7,
};*/


/**
 * For extended control codes in block_data on CEA-708, byte 1 is 0x10.
 * @private @const {!number}
 */
shaka.cea.Cea708Decoder.EXT_CEA708_CTRL_CODE_BYTE1 = 0x10;

/**
 * Blank cell for areas in memory which haven't been filled.
 * @private @const {!number}
 */
shaka.cea.Cea708Decoder.BLANK_CELL = -1;
