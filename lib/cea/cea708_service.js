/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea708Service');

/**
 * CEA-708 closed captions service as defined by CEA-708-E. A decoder can own up
 * to 63 services. Each service owns eight windows.
 */
shaka.cea.Cea708Service = class {
  /**
   * @param {!number} serviceNumber
   */
  constructor(serviceNumber) {
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
  }

  /**
   * Processes a CEA-708 control code.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @throws {!shaka.util.Error}
   */
  handleCea708ControlCode(dtvccPacket) {
    const blockData = dtvccPacket.readBlock();
    let controlCode = blockData.byte;
    const pts = blockData.pts;

    shaka.log.info('received control code: '+controlCode.toString(16));

    // Read extended control code if needed.
    if (controlCode === shaka.cea.Cea708Service.EXT_CEA708_CTRL_CODE_BYTE1) {
      const extendedControlCodeBlock = dtvccPacket.readBlock();
      controlCode = (controlCode << 16) | extendedControlCodeBlock.byte;
    }

    // Control codes are in 1 of 4 groups: CL, CR, GL, GR.
    if (controlCode >= 0x00 && controlCode <= 0x1f) {
      return this.handleC0_(controlCode, pts);
    } else if (controlCode >= 0x80 && controlCode <= 0x9f) {
      return this.handleC1_(dtvccPacket, controlCode, pts);
    } else if (controlCode >= 0x1000 && controlCode <= 0x101f) {
      this.handleC2_(dtvccPacket, controlCode);
    } else if (controlCode >= 0x1080 && controlCode <= 0x109f) {
      this.handleC3_(dtvccPacket, controlCode);
    } else if (controlCode >= 0x20 && controlCode <= 0x7f) {
      this.handleG0_(controlCode);
    } else if (controlCode >= 0xa0 && controlCode <= 0xff) {
      this.handleG1_(controlCode);
    } else if (controlCode >= 0x1020 && controlCode <= 0x107f) {
      this.handleG2_(controlCode & 0xff);
    } else if (controlCode >= 0x10a0 && controlCode <= 0x10ff) {
      this.handleG3_(controlCode & 0xff);
    }

    return null;
  }

  /**
   * Handles G0 group data.
   * @param {!number} controlCode
   * @private
   */
  handleG0_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    // G0 contains ASCII from 0x20 to 0x7f, with the exception that 0x7f
    // is replaced by a musical note.
    if (controlCode === 0x7f) {
      this.currentWindow_.setCharacter('♪');
      return;
    }
    this.currentWindow_.setCharacter(String.fromCharCode(controlCode));
  }

  /**
   * Handles G1 group data.
   * @param {!number} controlCode
   * @private
   */
  handleG1_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    // G1 is the Latin-1 Character Set from 0xa0 to 0xff.
    this.currentWindow_.setCharacter(String.fromCharCode(controlCode));
  }

  /**
   * Handles G2 group data.
   * @param {!number} controlCode
   * @private
   */
  handleG2_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }
    if (!shaka.cea.Cea708Service.G2Charset.has(controlCode)) {
      // If the character is unsupported, the spec says to put an underline.
      this.currentWindow_.setCharacter('_');
      return;
    }

    const char = shaka.cea.Cea708Service.G2Charset.get(controlCode);
    this.currentWindow_.setCharacter(char);
  }

  /**
   * Handles G3 group data.
   * @param {!number} controlCode
   * @private
   */
  handleG3_(controlCode) {
    if (!this.currentWindow_) {
      return;
    }

    // As of CEA-708-E, the G3 group only contains 1 character. It's a
    // [CC] character which has no unicode value on 0xa0.
    if (controlCode != 0xa0) {
      // Similar to G2, the spec decrees an underline if char is unsupported.
      this.currentWindow_.setCharacter('_');
      return;
    }

    this.currentWindow_.setCharacter('[CC]');
  }

  /**
   * Handles C0 group data.
   * @param {!number} controlCode
   * @param {!number} pts
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  handleC0_(controlCode, pts) {
    // All these commands pertain to the current window, so ensure it exists.
    if (!this.currentWindow_) {
      return null;
    }

    const window = this.currentWindow_;
    let parsedClosedCaption = null;

    // Note: This decoder ignores the "ETX" (end of text) control code. Since
    // this is JavaScript, a '\0' is not needed to terminate a string.
    switch (controlCode) {
      case shaka.cea.Cea708Service.ASCII_BACKSPACE:
        window.backspace();
        break;
      case shaka.cea.Cea708Service.ASCII_CARRIAGE_RETURN:
        // Force out the buffer, since the top row could be lost.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.carriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_HOR_CARRIAGE_RETURN:
        // Force out the buffer, a row will be erased.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.horizontalCarriageReturn();
        break;
      case shaka.cea.Cea708Service.ASCII_FORM_FEED:
        // Clear window and move pen to (0,0).
        // Force emit if the window is visible.
        if (window.isVisible()) {
          parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
        }
        window.resetMemory();
        window.setPenLocation(0, 0);
        break;
    }
    return parsedClosedCaption;
  }

  /**
   * Processes C1 group data.
   * These are caption commands.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} captionCommand
   * @param {!number} pts in seconds
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @throws {!shaka.util.Error} a possible out-of-range buffer read.
   * @private
   */
  handleC1_(dtvccPacket, captionCommand, pts) {
    // Note: This decoder ignores delay and delayCancel control codes in the C1.
    // group. These control codes delay processing of data for a set amount of
    // time, however this decoder processes that data immediately.

    if (captionCommand >= 0x80 && captionCommand <= 0x87) {
      const windowNum = captionCommand & 0x07;
      this.setCurrentWindow_(windowNum);
    } else if (captionCommand === 0x88) {
      const bitmap = dtvccPacket.readBlock().byte;
      return this.clearWindows_(bitmap, pts);
    } else if (captionCommand === 0x89) {
      const bitmap = dtvccPacket.readBlock().byte;
      this.displayWindows_(bitmap, pts);
    } else if (captionCommand === 0x8a) {
      const bitmap = dtvccPacket.readBlock().byte;
      return this.hideWindows_(bitmap, pts);
    } else if (captionCommand === 0x8b) {
      const bitmap = dtvccPacket.readBlock().byte;
      return this.toggleWindows_(bitmap, pts);
    } else if (captionCommand === 0x8c) {
      const bitmap = dtvccPacket.readBlock().byte;
      return this.deleteWindows_(bitmap, pts);
    } else if (captionCommand === 0x8f) {
      return this.reset_(pts);
    } else if (captionCommand === 0x90) {
      this.setPenAttributes_(dtvccPacket);
    } else if (captionCommand === 0x91) {
      this.setPenColor_(dtvccPacket);
    } else if (captionCommand === 0x92) {
      this.setPenLocation_(dtvccPacket);
    } else if (captionCommand === 0x97) {
      this.setWindowAttributes_(dtvccPacket);
    } else if (captionCommand >= 0x98 && captionCommand <= 0x9f) {
      const windowNum = (captionCommand & 0x0f) - 8;
      this.defineWindow_(dtvccPacket, windowNum, pts);
    }
    return null;
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
    // seen, then the appropriate number of bytes must be skipped as per spec.
    if (controlCode >= 0x08 && controlCode <= 0x0f) {
      dtvccPacket.skip(1);
    } else if (controlCode >= 0x10 && controlCode <= 0x17) {
      dtvccPacket.skip(2);
    } else if (controlCode >= 0x18 && controlCode <= 0x1f) {
      dtvccPacket.skip(3);
    }
  }

  /**
   * Handles C3 group data.
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} controlCode
   * @private
   */
  handleC3_(dtvccPacket, controlCode) {
    // This is an extended control code, so get the last 2 bytes
    controlCode &= 0xff;

    // There are currently no commands on the C3 table as of CEA-708-E, but if
    // seen, then the appropriate number of bytes must be skipped as per spec.
    if (controlCode >= 0x80 && controlCode <= 0x87) {
      dtvccPacket.skip(4);
    } else if (controlCode >= 0x80 && controlCode <= 0x8f) {
      dtvccPacket.skip(5);
    }
  }

  /**
   * @param {!number} windowNum
   * @private
   */
  setCurrentWindow_(windowNum) {
    // If the window isn't created, ignore the command.
    if (!this.windows_[windowNum]) {
      return;
    }
    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Yields each non-null window specified in the 8-bit bitmap.
   * @param {!number} bitmap 8 bits corresponding to each of the 8 windows.
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
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  clearWindows_(windowsBitmap, pts) {
    let parsedClosedCaption = null;

    // Clears windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      // If window visible and being cleared, emit buffer and reset start time!
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
      }
      window.resetMemory();
    }
    return parsedClosedCaption;
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   * @private
   */
  displayWindows_(windowsBitmap, pts) {
    // Displays windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (!window.isVisible()) {
        shaka.log.info('turning on display');
        // We are turning on the visibility, set the start time.
        window.setStartTime(pts);
      }
      window.display();
    }
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  hideWindows_(windowsBitmap, pts) {
    let parsedClosedCaption = null;

    // Hides windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
      }
      window.hide();
    }
    return parsedClosedCaption;
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  toggleWindows_(windowsBitmap, pts) {
    let parsedClosedCaption = null;

    // Toggles windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      shaka.log.info('got window: '+windowId);
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        shaka.log.info('toggling windows');
        parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
      } else {
        // We are turning on visibility, set the start time.
        window.setStartTime(pts);
      }

      window.toggle();
    }
    return parsedClosedCaption;
  }

  /**
   * @param {!number} windowsBitmap
   * @param {!number} pts
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  deleteWindows_(windowsBitmap, pts) {
    let parsedClosedCaption = null;
    // Deletes windows from the 8 bit bitmap.
    for (const windowId of this.getSpecifiedWindowIds_(windowsBitmap)) {
      const window = this.windows_[windowId];
      if (window.isVisible()) {
        // We are turning off the visibility, emit!
        parsedClosedCaption = window.forceEmit(pts, this.serviceNumber_);
      }
      // Delete the window from the list of windows
      this.windows_[windowId] = null;
    }
    return parsedClosedCaption;
  }

  /**
   * Emits anything currently present in any of the windows, and then
   * deletes all windows, cancels all delays, reinitializes the service.
   * @param {!number} pts
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  reset_(pts) {
    const allWindowsBitmap = 0xff; // All windows should be deleted.
    const caption = this.deleteWindows_(allWindowsBitmap, pts);
    this.clear();
    return caption;
  }

  /**
   * Clears the state of the service completely.
   */
  clear() {
    this.currentWindow_ = null;
    this.windows_ = [null, null, null, null, null, null, null, null];
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenAttributes_(dtvccPacket) {
    // Following 2 bytes take the following form:
    // b1 = |TXT_TAG|OFS|PSZ| , b2 = |I|U|EDTYP|FNTAG|
    // We are only concerned with the info in byte 2 for this decoder.

    dtvccPacket.skip(1); // Skip first byte
    const attrByte2 = dtvccPacket.readBlock().byte;

    if (!this.currentWindow_) {
      return;
    }

    const italics = (attrByte2 & 0x80) > 0;
    const underline = (attrByte2 & 0x40) > 0;

    this.currentWindow_.setPenItalics(italics);
    this.currentWindow_.setPenUnderline(underline);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenColor_(dtvccPacket) {
    // Read foreground and background properties.
    const foregroundByte = dtvccPacket.readBlock().byte;
    const backgroundByte = dtvccPacket.readBlock().byte;
    dtvccPacket.skip(1); // Edge color not supported, skip it.

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

    shaka.log.info('foreground attribute: '+foregroundByte.toString(2));
    shaka.log.info('background attribute: '+backgroundByte.toString(2));

    const foregroundColor = this.rgbColorToHex_(
        foregroundRed, foregroundGreen, foregroundBlue);

    const backgroundColor = this.rgbColorToHex_(
        backgroundRed, backgroundGreen, backgroundBlue);

    this.currentWindow_.setPenTextColor(foregroundColor);
    this.currentWindow_.setPenBackgroundColor(backgroundColor);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setPenLocation_(dtvccPacket) {
    // Following 2 bytes take the following form:
    // b1 = |0|0|0|0|ROW| and b2 = |0|0|COLUMN|
    const locationByte1 = dtvccPacket.readBlock().byte;
    const locationByte2 = dtvccPacket.readBlock().byte;

    if (!this.currentWindow_) {
      return;
    }

    const row = locationByte1 & 0x0f;
    const col = locationByte2 & 0x3f;
    shaka.log.info(`set pen location called (${row},${col})`);
    this.currentWindow_.setPenLocation(row, col);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @throws {!shaka.util.Error}
   * @private
   */
  setWindowAttributes_(dtvccPacket) {
    // 4 bytes follow, with the following form:
    // b1 = |FOP|F_R|F_G|F_B|, b2 = |BTP|B_R|B_G|B_B|
    // b3 = |W|B|PRD|SCD|JST|, b4 = |EFT_SPD|EFD|DEF|
    dtvccPacket.skip(1); // Fill color not supported, skip.
    dtvccPacket.skip(1); // Border colors not supported, skip.
    const b3 = dtvccPacket.readBlock().byte;
    dtvccPacket.skip(1); // Effects not supported, skip.

    if (!this.currentWindow_) {
      return;
    }

    // Word wrap is outdated as of CEA-708-E, so we ignore those bits.
    const justification = b3 & 0x03;
    this.currentWindow_.setJustification(justification);
  }

  /**
   * @param {!shaka.cea.DtvccPacket} dtvccPacket
   * @param {!number} windowNum
   * @param {!number} pts
   * @throws {!shaka.util.Error}
   * @private
   */
  defineWindow_(dtvccPacket, windowNum, pts) {
    // Create the window if it doesn't exist.
    const windowAlreadyExists = this.windows_[windowNum] !== null;
    if (!windowAlreadyExists) {
      const window = new shaka.cea.Cea708Window(windowNum);
      window.setStartTime(pts);
      this.windows_[windowNum] = window;
    }

    // 6 Bytes follow, with the following form:
    // b1 = |0|0|V|R|C|PRIOR|, b2 = |P|VERT_ANCHOR|, b3 = |HOR_ANCHOR|
    // b4 = |ANC_ID|ROW_CNT|, b5 = |0|0|COL_COUNT|, b6 = |0|0|WNSTY|PNSTY|
    const b1 = dtvccPacket.readBlock().byte;
    const b2 = dtvccPacket.readBlock().byte;
    const b3 = dtvccPacket.readBlock().byte;
    const b4 = dtvccPacket.readBlock().byte;
    const b5 = dtvccPacket.readBlock().byte;
    const b6 = dtvccPacket.readBlock().byte;

    // As per 8.4.7 of CEA-708-E, row locks and column locks are to be ignored.
    // So this decoder will ignore these values.

    const visible = (b1 & 0x20) > 0;
    const verticalAnchor = b2 & 0x7f;
    const toggleRelative = (b2 & 0x80) > 0;
    const horAnchor = b3;
    const rowCount = (b4 & 0x0f) + 1; // Spec says to add 1.
    const anchorId = (b4 & 0xf0) >> 4;
    const colCount = (b5 & 0x3f) + 1; // Spec says to add 1.

    // If pen style = 0 AND window previously existed, keep its pen style.
    // Otherwise, change the pen style (For now, just reset to the default pen).
    // TODO add support for predefined pen styles and fonts.
    const penStyle = b6 & 0x07;
    if (!windowAlreadyExists || penStyle !== 0) {
      this.windows_[windowNum].resetPen();
    }

    this.windows_[windowNum].defineWindow(visible, verticalAnchor,
        toggleRelative, horAnchor, anchorId, rowCount, colCount);

    // Set the current window to the newly defined window.
    this.currentWindow_ = this.windows_[windowNum];
  }

  /**
   * Maps 64 possible CEA-708 colors to 8 CSS colors.
   * @param {!number} red value from 0-3
   * @param {!number} green value from 0-3
   * @param {!number} blue value from 0-3
   * @return {!string}
   * @private
   */
  rgbColorToHex_(red, green, blue) {
    // Rather than supporting 64 colors, this decoder supports 8 colors and
    // gets the closest color, as per 9.19 of CEA-708-E. This is because some
    // colors on television such as white, are often sent with lower intensity
    // and often appear dull/greyish on the browser, making them hard to read.

    // As per CEA-708-E 9.19, these mappings will map 64 colors to 8 colors.
    const colorMapping = {0: 0, 1: 0, 2: 1, 3: 1};
    red = colorMapping[red];
    green = colorMapping[green];
    blue = colorMapping[blue];

    const colorCode = (red << 2) | (green << 1) | blue;
    return shaka.cea.Cea708Service.Colors[colorCode];
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
 * Holds characters mapping for bytes that are G2 control codes.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.Cea708Service.G2Charset = new Map([
  [0x20, ' '], [0x21, ' '], [0x25, '…'], [0x2a, 'Š'], [0x2c, 'Œ'], [0x30, ' '],
  [0x31, '‘'], [0x32, '’'], [0x33, '“'], [0x34, '”'], [0x35, '•'], [0x39, '™'],
  [0x3a, 'š'], [0x3c, 'œ'], [0x3d, '℠'], [0x3f, 'Ÿ'], [0x76, '⅛'], [0x77, '⅜'],
  [0x78, '⅝'], [0x79, '⅞'], [0x7a, '│'], [0x7b, '┐'], [0x7c, '└'], [0x7d, '─'],
  [0x7e, '┘'], [0x7f, '┌'],
]);

shaka.cea.Cea708Service.Colors = [
  'black', 'blue', 'green', 'cyan',
  'red', 'magenta', 'yellow', 'white',
];

/**
 * CEA-708 closed captions byte.
 * @typedef {{
 *   pts: number,
 *   type: number,
 *   byte: number,
 *   order: number
 * }}
 *
 * @property {!number} pts
 *   Presentation timestamp (in second) at which this packet was received.
 * @property {!number} type
 *   Type of the byte. Either 2 or 3, DTVCC Packet Data or a DTVCC Packet Start.
 * @property {!number} byte The byte containing data relevant to the packet.
 * @property {(!number)} order
 *   A number indicating the order this packet was received in a sequence
 *   of packets. Used to break ties in a stable sorting algorithm
 */
shaka.cea.Cea708Service.Cea708Byte;
