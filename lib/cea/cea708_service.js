/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Service');

/**
 * 708 closed captions decoder.
 */
shaka.cea.Cea708Service = class {
  /**
   * @param {!shaka.cea.CeaDecoder} decoder
   * @param {!number} serviceNumber
   */
  constructor(decoder, serviceNumber) {
    /**
     * Reference to the CeaDecoder which constructed this 708 decoder.
     * @private {!shaka.cea.CeaDecoder}
     */
    this.decoder_ = decoder;

    /**
     * Number for this specific service (1 - 63).
     * @private {!number}
     */
    this.serviceNumber_ = serviceNumber;

    /**
     * Eight Cea708 Windows, as defined by the spec.
     * @private {!Array<?shaka.cea.Cea708Window>}
     */
    this.windows_ = [
      null, null, null, null, null, null, null, null,
    ];

    /**
     * The current window for which window command operate on.
     * @private {?shaka.cea.Cea708Window}
     */
    this.currentWindow_ = null;

    shaka.util.Functional.ignored(this.currentWindow_);
  }

  /**
   * Processes a CEA-708 control code.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  handleCea708ControlCode(dtvccPacket) {
    const blockData = dtvccPacket.readByte();
    let controlCode = blockData.byte;
    const pts = blockData.pts;
    if (controlCode === shaka.cea.Cea708Service.EXT_CEA708_CTRL_CODE_BYTE1) {
      const extendedControlCodeBlock = dtvccPacket.readByte();
      controlCode = (controlCode << 16) | extendedControlCodeBlock.byte;
    }

    shaka.log.info('708 2 control code: '+controlCode.toString(16)+' time: '+pts);

    // Control codes are in 4 groups: CL, CR, GL, GR.
    // All the "CL" and "CR" group control codes may read additional blocks, so
    // they need access to the packet. However, "GL" and "GR" groups do not.
    if (controlCode >= 0x00 && controlCode <= 0x1f) {
      this.handleC0_(dtvccPacket, controlCode, pts);
    } else if (controlCode >= 0x80 && controlCode <= 0x9f) {
      // shaka.log.info('C1');
      this.handleC1_(dtvccPacket, controlCode, pts);
    } else if (controlCode >= 0x1000 && controlCode <= 0x101f) {
      this.handleC2_(dtvccPacket, controlCode);
    } else if (controlCode >= 0x1080 && controlCode <= 0x109f) {
      this.handleC3_(dtvccPacket, controlCode);
    } else if (controlCode >= 0x20 && controlCode <= 0x7f) {
      // shaka.log.info('G0');
      this.handleG0_(controlCode, pts);
    } else if (controlCode >= 0xa0 && controlCode <= 0xff) {
      shaka.log.info('G1');
      this.handleG1_(controlCode);
    } else if (controlCode >= 0x1020 && controlCode <= 0x107f) {
      shaka.log.info('G2');
    } else if (controlCode >= 0x10a0 && controlCode <= 0x10ff) {
      shaka.log.info('G3');
    }
  }

  /**
   * Handles G0 group data.
   * @param {!number} controlCode
   * @param {!number} pts
   * @private
   */
  handleG0_(controlCode, pts) {
    const window = this.currentWindow_;
    if (!window) {
      return;
    }
    // G0 contains ASCII from 0x20 to 0x7f, with the exception that 0x7f
    // is replaced by a musical note.
    shaka.log.info('G0 control code: '+controlCode.toString(16)+' pts: '+pts);
    if (controlCode === 0x7f) {
      const musicalNoteUtfValue = 0x266A;
      window.setCharacter(musicalNoteUtfValue);
    } else {
      shaka.log.info(controlCode.toString(16)+' '+String.fromCharCode(controlCode));
      window.setCharacter(controlCode);
    }
  }

  /**
   * Handles G0 group data.
   * @param {!number} controlCode
   * @private
   */
  handleG1_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    shaka.log.info('adding g1');
    this.currentWindow_.setCharacter(controlCode);
  }

  /**
   * Handles C0 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} controlCode
   * @param {!number} pts
   * @private
   */
  handleC0_(dtvccPacket, controlCode, pts) {
    // All these commands pertain to the current window, so ensure it exists.
    if (!this.currentWindow_) {
      return;
    }

    const window = this.currentWindow_;

    switch (controlCode) {
      case shaka.cea.Cea708Service.ASCII_BACKSPACE:
        shaka.log.info('backspace!');
        window.backspace();
        break;
      case 0x03:
        this.endOfText_();
        break;
      case shaka.cea.Cea708Service.ASCII_CARRIAGE_RETURN:
        shaka.log.info('carriage return!');
        // Force out the buffer, since the top row could be lost.
        if (window.isVisible()) {
          window.forceEmit(pts);
          window.setStartTime(pts);
        }
        window.carriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_HOR_CARRIAGE_RETURN:
        // Todo emit here, data can be lost
        window.horizontalCarriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_FORM_FEED:
        //  Clear window and move pen to (0,0))
        // Force emit if the window is visible.
        if (window.isVisible()) {
          window.forceEmit(pts);
          window.setStartTime(pts);
        }
        window.clear();
        window.getPen().setRowLocation(0);
        window.getPen().setColLocation(0);
        break;
    }
  }

  /**
   * Handles C2 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} controlCode
   * @private
   */
  handleC2_(dtvccPacket, controlCode) {
    // This is an extended control code, so get the last 2 bytes
    controlCode &= 0xff;

    // There are currently no commands on the C2 table as of CEA-708-E, but if
    // this is seen, then the appropriate number of bytes must be skipped.
    if (controlCode >= 0x08 && controlCode <= 0x0f) {
      dtvccPacket.skip(1);
    } else if (controlCode >= 0x10 && controlCode <= 0x17) {
      dtvccPacket.skip(2);
    } else if (controlCode >= 0x18 && controlCode <= 0x1f) {
      dtvccPacket.skip(3);
    }
  }

  /**
   * Handles C2 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} controlCode
   * @private
   */
  handleC3_(dtvccPacket, controlCode) {
    // This is an extended control code, so get the last 2 bytes
    controlCode &= 0xff;

    // There are currently no commands on the C3 table as of CEA-708-E, but if
    // this is seen, then the appropriate number of bytes must be skipped
    if (controlCode >= 0x80 && controlCode <= 0x87) {
      dtvccPacket.skip(4);
    } else if (controlCode >= 0x80 && controlCode <= 0x8f) {
      dtvccPacket.skip(5);
    }
  }

  /**
   * Processes C1 group data.
   * These are caption commands.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} captionCommand
   * @param {!number} pts in seconds
   * @throws {!shaka.util.Error} a possible out-of-range buffer read.
   * @private
   */
  handleC1_(dtvccPacket, captionCommand, pts) {
    shaka.log.info('C1 control Code:' +captionCommand.toString(16)+' pts: '+pts);
    if (captionCommand >= 0x80 && captionCommand <= 0x87) {
      const windowNum = captionCommand & 0x07;
      this.setCurrentWindow(windowNum);
    } else if (captionCommand === 0x88) {
      const bitmap = dtvccPacket.readByte().byte;
      this.clearWindows(bitmap, pts);
    } else if (captionCommand === 0x89) {
      const bitmap = dtvccPacket.readByte().byte;
      this.displayWindows(bitmap, pts);
    } else if (captionCommand === 0x8a) {
      const bitmap = dtvccPacket.readByte().byte;
      this.hideWindows(bitmap, pts);
    } else if (captionCommand === 0x8b) {
      const bitmap = dtvccPacket.readByte().byte;
      this.toggleWindows(bitmap, pts);
    } else if (captionCommand === 0x8c) {
      const bitmap = dtvccPacket.readByte().byte;
      this.deleteWindows(bitmap, pts);
    } else if (captionCommand === 0x8d) {
      this.delay(dtvccPacket);
    } else if (captionCommand === 0x8e) {
      this.cancelDelay();
    } else if (captionCommand === 0x8f) {
      this.reset(pts);
    } else if (captionCommand === 0x90) {
      this.setPenAttributes(dtvccPacket);
    } else if (captionCommand === 0x91) {
      this.setPenColor(dtvccPacket);
    } else if (captionCommand === 0x92) {
      this.setPenLocation(dtvccPacket);
    } else if (captionCommand === 0x97) {
      this.setWindowAttributes(dtvccPacket);
    } else if (captionCommand >= 0x98 && captionCommand <= 0x9f) {
      const windowNum = (captionCommand & 0x0f) - 8;
      this.defineWindow(dtvccPacket, windowNum, pts);
    }
  }

  /**
   * ETX command, Noop? todo
   * @private
   */
  endOfText_() {
    shaka.log.info('end of text');
  }

  /**
   * @param {!number} windowNum
   */
  setCurrentWindow(windowNum) {
    shaka.log.info('setcurrentwindow called');
    // If the window isn't created, ignore the command.
    if (!this.windows_[windowNum]) {
      return;
    }
    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Yields each non-null window specified in the 8-bit bitmap.
   * @param {!number} bitmap
   * @return {!Iterable.<!number>}
   * @private
   */
  * getSpecifiedWindowIds_(bitmap) {
    for (let i = 0; i < 8; i++) {
      const windowSpecified = (bitmap & 0x01) === 0x01;
      if (windowSpecified && this.windows_[i]) {
        yield i;
      }
      bitmap >>= 1;
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   */
  clearWindows(windowsBitmap, pts) {
    // Clears windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      // If window visible and being cleared, emit buffer and reset start time!
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        window.forceEmit(pts);
        window.setStartTime(pts);
      }
      window.clear();
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   */
  displayWindows(windowsBitmap, pts) {
    shaka.log.info('display windows called!');
    // Displays windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (!window.isVisible()) {
        // We are turning on the visibility, set the start time.
        window.setStartTime(pts);
      }
      window.display();
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   */
  hideWindows(windowsBitmap, pts) {
    // Hides windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        window.forceEmit(pts);
      }
      window.hide();
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   */
  toggleWindows(windowsBitmap, pts) {
    // Toggles windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        shaka.log.info(`${windowId} is visible and being force emitted`);
        // We are turning off the visibility, emit!
        window.forceEmit(pts);
      } else {
        // We are turning on the visibility, set the start time.
        window.setStartTime(pts);
      }
      window.toggle();
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   */
  deleteWindows(windowsBitmap, pts) {
    // Deletes windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        window.forceEmit(pts);
      }
      // Delete the window from the list of windows
      this.windows_[windowId] = null;
    }
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  delay(dtvccPacket) {
    dtvccPacket.skip(1);
    // Todo implement delay
  }

  cancelDelay() {}

  /**
   * Deletes all windows, cancels all delays.
   * @param {!number} pts
   */
  reset(pts) {
    const allWindowsBitmap = 0xff; // All windows should be deleted.
    this.deleteWindows(allWindowsBitmap, pts);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  setPenAttributes(dtvccPacket) {
    // Following 2 bytes take the following form:
    // b1 = |TXT_TAG|OFS|PSZ| , b2 = |I|U|EDTYP|FNTAG|
    // We are only concerned with the info in byte 2 for this decoder.

    dtvccPacket.skip(1); // Skip first byte
    const attrByte2 = dtvccPacket.readByte().byte;

    if (!this.currentWindow_) {
      return;
    }

    const italics = (attrByte2 & 0x80) > 0;
    const underline = (attrByte2 & 0x40) > 0;

    this.currentWindow_.getPen().setItalics(italics);
    this.currentWindow_.getPen().setUnderline(underline);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  setPenColor(dtvccPacket) {
    // Read foreground and background properties.
    shaka.log.info('setPenColor');
    const foregroundByte = dtvccPacket.readByte().byte;
    const backgroundByte = dtvccPacket.readByte().byte;
    dtvccPacket.skip(1); // Edge color not supported, skip it.
    shaka.log.info('setPenColor here');

    if (!this.currentWindow_) {
      return;
    }

    // Foreground color properties: |FOP|F_R|F_G|F_B|.
    const foregroundBlue = foregroundByte & 0x03;
    const foregroundGreen = (foregroundByte & 0x0c) >> 2;
    const foregroundRed = (foregroundByte & 0x30) >> 4;

    // Background color properties: |BOP|B_R|B_G|B_B|.

    const backgroundBlue = backgroundByte & 0x03;
    const backgroundGreen = (backgroundByte & 0x0c) >> 2;
    const backgroundRed = (backgroundByte & 0x30) >> 4;

    const foregroundColor = this.rgbColorToHex_(
        foregroundRed, foregroundGreen, foregroundBlue);

    const backgroundColor = this.rgbColorToHex_(
        backgroundRed, backgroundGreen, backgroundBlue);

    this.currentWindow_.getPen().setTextColor(foregroundColor);
    this.currentWindow_.getPen().setBackgroundColor(backgroundColor);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  setPenLocation(dtvccPacket) {
    // Following 2 bytes take the following form:
    // b1 = |0|0|0|0|ROW| and b2 = |0|0|COLUMN|
    const locationByte1 = dtvccPacket.readByte().byte;
    const locationByte2 = dtvccPacket.readByte().byte;
    if (!this.currentWindow_) {
      return;
    }

    const row = locationByte1 & 0x0f;
    const col = locationByte2 & 0x3f;
    shaka.log.info(`set pen location called (${row},${col})`);
    this.currentWindow_.getPen().setRowLocation(row);
    this.currentWindow_.getPen().setColLocation(col);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   */
  setWindowAttributes(dtvccPacket) {
    // 4 bytes follow, with the following form:
    // b1 = |FOP|F_R|F_G|F_B|, b2 = |BTP|B_R|B_G|B_B|
    // b3 = |W|B|PRD|SCD|JST|, b4 = |EFT_SPD|EFD|DEF|
    const b1 = dtvccPacket.readByte().byte;
    dtvccPacket.skip(1); // Border colors not supported, skip.
    const b3 = dtvccPacket.readByte().byte;
    dtvccPacket.skip(1); // Effects not supported, skip.

    if (!this.currentWindow_) {
      return;
    }

    // Word wrap is outdated as of CEA-708-E, so we ignore those bits.
    const fillBlue= b1 & 0x03;
    const fillGreen = (b1 & 0x0b) >> 2;
    const fillRed = (b1 & 0x30) >> 4;
    const fillColor = this.rgbColorToHex_(fillRed, fillGreen, fillBlue);
    const justification = b3 & 0x03;


    this.currentWindow_.setAttributes(justification, fillColor);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} windowNum
   * @param {!number} pts
   */
  defineWindow(dtvccPacket, windowNum, pts) {
    // 6 Bytes follow, with the following form:
    // b1 = |0|0|V|R|C|PRIOR|, b2 = |P|VERT_ANCHOR|, b3 = |HOR_ANCHOR|
    // b1 = |ANC_ID|ROW_CNT|, b2 = |0|0|COL_COUNT|, b3 = |0|0|WNSTY|PNSTY|
    const windowAlreadyExists = this.windows_[windowNum] !== null;
    if (!windowAlreadyExists) {
      const window = new shaka.cea.Cea708Window(
          this.decoder_, this.serviceNumber_, windowNum);
      window.setStartTime(pts);
      this.windows_[windowNum] = window;
    }

    const b1 = dtvccPacket.readByte().byte;
    const b2 = dtvccPacket.readByte().byte;
    const b3 = dtvccPacket.readByte().byte;
    const b4 = dtvccPacket.readByte().byte;
    const b5 = dtvccPacket.readByte().byte;
    const b6 = dtvccPacket.readByte().byte;

    const priority = b1 & 0x07;
    const columnLock = (b1 & 0x08) > 0;
    const rowLock = (b1 & 0x10) > 0;
    const visible = (b1 & 0x20) > 0;
    const verticalAnchor = b2 & 0x7f;
    const toggleRelative = (b2 & 0x80) > 0;
    const horAnchor = b3;
    const rowCount = (b4 & 0x0f) + 1; // 0 -> 1 , 1 -> 2, etc. so add 1.
    const anchorId = (b4 & 0xf0) >> 4;
    const colCount = (b5 & 0x3f) + 1;
    shaka.log.info('define window: '+windowNum+' visible: '+visible+' b1: '+b1.toString(16));

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

    this.windows_[windowNum].update(priority, columnLock, rowLock,
        visible, verticalAnchor, toggleRelative, horAnchor,
        rowCount, anchorId, colCount);
    // If 0, set default window style 1 for new windows and prev. window
    // style for existing windows. Otherwise, use predefined pen styles.
    // const windowStyle = (b6 & 0x38) >> 3;

    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Converts CEA-708 RGB value, which ranges from 0-3, to a CSS hex color.
   * @param {!number} red
   * @param {!number} green
   * @param {!number} blue
   * @return {!string}
   * @private
   */
  rgbColorToHex_(red, green, blue) {
    // R, G, B are each from 0 to 3. To map them to CSS (0-255), multiply by 85.
    red *= 85;
    green *= 85;
    blue *= 85;

    // All hex strings should have two digits.
    const hexRed = ('0'+red.toString(16)).slice(-2);
    const hexGreen = ('0'+green.toString(16)).slice(-2);
    const hexBlue = ('0'+blue.toString(16)).slice(-2);
    return `#${hexRed}${hexGreen}${hexBlue}`;
  }
};

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Service.ASCII_BACKSPACE = 0x08;

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Service.ASCII_FORM_FEED = 0x0c;

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Service.ASCII_CARRIAGE_RETURN = 0x0d;

/**
 * @private @const {!number}
 */
shaka.cea.Cea708Service.ASCII_HOR_CARRIAGE_RETURN = 0x0e;

/**
 * For extended control codes in block_data on CEA-708, byte 1 is 0x10.
 * @private @const {!number}
 */
shaka.cea.Cea708Service.EXT_CEA708_CTRL_CODE_BYTE1 = 0x10;

/**
 * 708 closed captions byte - time, byte and the order in which it was received.
 * TODO add descriptions.
 * @typedef {{
 *   byte: number,
 *   pts: number,
 *   type: number,
 *   order: number
 * }}
 */
shaka.cea.Cea708Service.Cea708Byte;
