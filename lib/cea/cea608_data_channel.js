/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea608DataChannel');

goog.require('shaka.cea.Cea608Memory');
goog.require('shaka.cea.CeaUtils');
goog.require('shaka.log');


/**
 * 608 closed captions channel.
 */
shaka.cea.Cea608DataChannel = class {
  /**
   * @param {number} fieldNum Field number.
   * @param {number} channelNum Channel number.
   */
  constructor(fieldNum, channelNum) {
    /**
     * Current Caption Type.
     * @public {!shaka.cea.Cea608DataChannel.CaptionType}
     */
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.NONE;

    /**
     * Text buffer for CEA-608 "text mode". Although, we don't emit text mode.
     * So, this buffer serves as a no-op placeholder, just in case we receive
     * captions that toggle text mode.
     * @private @const {!shaka.cea.Cea608Memory}
     */
    this.text_ =
        new shaka.cea.Cea608Memory(fieldNum, channelNum);

    /**
     * Displayed memory.
     * @private {!shaka.cea.Cea608Memory}
     */
    this.displayedMemory_ =
        new shaka.cea.Cea608Memory(fieldNum, channelNum);

    /**
     * Non-displayed memory.
     * @private {!shaka.cea.Cea608Memory}
     */
    this.nonDisplayedMemory_ =
        new shaka.cea.Cea608Memory(fieldNum, channelNum);

    /**
     * Points to current buffer.
     * @private {!shaka.cea.Cea608Memory}
     */
    this.curBuf_ = this.nonDisplayedMemory_;

    /**
     * End time of the previous caption, serves as start time of next caption.
     * @private {number}
     */
    this.prevEndTime_ = 0;

    /**
     * Last control pair, 16 bits representing byte 1 and byte 2
     * @private {?number}
     */
    this.lastCp_ = null;
  }

  /**
   * Resets channel state.
   */
  reset() {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.NONE;
    this.curBuf_ = this.nonDisplayedMemory_;
    this.lastCp_ = null;
    this.displayedMemory_.reset();
    this.nonDisplayedMemory_.reset();
    this.text_.reset();
  }

  /**
   * Set the initial PTS, which may not be 0 if we start decoding at a later
   * point in the stream.  Without this, the first cue's startTime can be way
   * off.
   *
   * @param {number} pts
   */
  firstPts(pts) {
    this.prevEndTime_ = pts;
  }

  /**
   * Gets the row index from a Preamble Address Code byte pair.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {number} Row index.
   * @private
   */
  pacToRow_(b1, b2) {
    const ccRowTab = [
      11, 11,  // 0x00 or 0x01
      1, 2,    // 0x02 -> 0x03
      3, 4,    // 0x04 -> 0x05
      12, 13,  // 0x06 -> 0x07
      14, 15,  // 0x08 -> 0x09
      5, 6,    // 0x0A -> 0x0B
      7, 8,    // 0x0C -> 0x0D
      9, 10,   // 0x0E -> 0x0F
    ];
    return ccRowTab[((b1 & 0x07) << 1) | ((b2 >> 5) & 0x01)];
  }

  /**
   * PAC - Preamble Address Code.
   * b1 is of the form |P|0|0|1|C|0|ROW|
   * b2 is of the form |P|1|N|ATTRIBUTE|U|
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @private
   */
  controlPac_(b1, b2) {
    const row = this.pacToRow_(b1, b2);

    // Set up the defaults.
    let textColor = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    let italics = false;
    let indent = null;

    // Get PAC index;
    let pacIndex;
    if (b2 > 0x5f) {
      pacIndex = b2 - 0x60;
    } else {
      pacIndex = b2 - 0x40;
    }

    if (pacIndex <= 0xd) {
      const colorIndex = Math.floor(pacIndex / 2);
      textColor = shaka.cea.Cea608DataChannel.TEXT_COLORS[colorIndex];
    } else if (pacIndex <= 0xf) {
      italics = true; // color stays white
    } else {
      indent = Math.floor((pacIndex - 0x10) / 2);
    }

    // PACs toggle underline on the last bit of b2.
    const underline = (b2 & 0x01) === 0x01;

    if (this.type_ === shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      // Don't execute the PAC if in text mode.
      return;
    }

    // Execute the PAC.
    const buf = this.curBuf_;

    // Move entire scroll window to a new base in rollup mode.
    if (this.type_ === shaka.cea.Cea608DataChannel.CaptionType.ROLLUP &&
        row !== buf.getRow()) {
      const oldTopRow = 1 + buf.getRow() - buf.getScrollSize();
      const newTopRow = 1 + row - buf.getScrollSize();

      // Shift up the scroll window.
      buf.moveRows(newTopRow, oldTopRow, buf.getScrollSize());

      // Clear everything outside of the new scroll window.
      buf.resetRows(0, newTopRow - 1);
      buf.resetRows(row + 1,
          shaka.cea.Cea608Memory.CC_ROWS - row);
    }
    buf.setRow(row);

    buf.setUnderline(underline);
    buf.setItalics(italics);
    buf.setTextColor(textColor);
    buf.setIndent(indent);

    // Clear the background color, since new row (PAC) should reset ALL styles.
    buf.setBackgroundColor(shaka.cea.CeaUtils.DEFAULT_BG_COLOR);
  }

  /**
   * Mid-Row control code handler.
   * @param {number} b2 Byte #2.
   * @private
   */
  controlMidrow_(b2) {
    // Clear all pre-existing midrow style attributes.
    this.curBuf_.setUnderline(false);
    this.curBuf_.setItalics(false);
    this.curBuf_.setTextColor(shaka.cea.CeaUtils.DEFAULT_TXT_COLOR);

    // Mid-row attrs use a space.
    this.curBuf_.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, ' '.charCodeAt(0));

    let textColor = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    let italics = false;

    // Midrow codes set underline on last (LSB) bit.
    const underline = (b2 & 0x01) === 0x01;

    // b2 has the form |P|0|1|0|STYLE|U|
    textColor = shaka.cea.Cea608DataChannel.TEXT_COLORS[(b2 & 0xe) >> 1];
    if (textColor === 'white_italics') {
      textColor = 'white';
      italics = true;
    }

    this.curBuf_.setUnderline(underline);
    this.curBuf_.setItalics(italics);
    this.curBuf_.setTextColor(textColor);
  }

  /**
   * Background attribute control code handler.
   * @param {number} b1 Byte #1
   * @param {number} b2 Byte #2.
   * @private
   */
  controlBackgroundAttribute_(b1, b2) {
    let backgroundColor = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;
    if ((b1 & 0x07) === 0x0) {
      // If background provided, last 3 bits of b1 are |0|0|0|. Color is in b2.
      backgroundColor = shaka.cea.Cea608DataChannel.BG_COLORS[(b2 & 0xe) >> 1];
    }
    this.curBuf_.setBackgroundColor(backgroundColor);
  }

  /**
   * The Cea608DataChannel control methods implement all CC control operations.
   * @param {!shaka.cea.Cea608DataChannel.Cea608Packet} ccPacket
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   * @private
   */
  controlMiscellaneous_(ccPacket) {
    const MiscCmd = shaka.cea.Cea608DataChannel.MiscCmd_;
    const b2 = ccPacket.ccData2;
    const pts = ccPacket.pts;
    let parsedClosedCaption = null;

    switch (b2) {
      case MiscCmd.RCL:
        this.controlRcl_();
        break;
      case MiscCmd.BS:
        this.controlBs_();
        break;
        // unused (alarm off and alarm on)
      case MiscCmd.AOD:
      case MiscCmd.AON:
        break;
      case MiscCmd.DER:
        // Delete to End of Row. Not implemented since position not supported.
        break;
      case MiscCmd.RU2:
        parsedClosedCaption = this.controlRu_(2, pts);
        break;
      case MiscCmd.RU3:
        parsedClosedCaption = this.controlRu_(3, pts);
        break;
      case MiscCmd.RU4:
        parsedClosedCaption = this.controlRu_(4, pts);
        break;
      case MiscCmd.FON:
        this.controlFon_();
        break;
      case MiscCmd.RDC:
        this.controlRdc_(pts);
        break;
      case MiscCmd.TR:
        this.controlTr_();
        break;
      case MiscCmd.RTD:
        this.controlRtd_();
        break;
      case MiscCmd.EDM:
        parsedClosedCaption = this.controlEdm_(pts);
        break;
      case MiscCmd.CR:
        parsedClosedCaption = this.controlCr_(pts);
        break;
      case MiscCmd.ENM:
        this.controlEnm_();
        break;
      case MiscCmd.EOC:
        parsedClosedCaption = this.controlEoc_(pts);
        break;
    }
    return parsedClosedCaption;
  }

  /**
   * Handles CR - Carriage Return (Start new row).
   * CR only affects scroll windows (Rollup and Text modes).
   * Any currently buffered line needs to be emitted, along
   * with a window scroll action.
   * @param {number} pts in seconds.
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   * @private
   */
  controlCr_(pts) {
    const buf = this.curBuf_;
    // Only rollup and text mode is affected, but we don't emit text mode.
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.ROLLUP) {
      return null;
    }
    // Force out the scroll window since the top row will cleared.
    const parsedClosedCaption = buf.forceEmit(this.prevEndTime_, pts);

    // Calculate the top of the scroll window.
    const topRow = (buf.getRow() - buf.getScrollSize()) + 1;

    // Shift up the window one row higher.
    buf.moveRows(topRow - 1, topRow, buf.getScrollSize());

    // Clear out anything that's outside of our current scroll window.
    buf.resetRows(0, topRow - 1);
    buf.resetRows(buf.getRow(), shaka.cea.Cea608Memory.CC_ROWS - buf.getRow());

    // Update the end time so the next caption emits starting at this time.
    this.prevEndTime_ = pts;
    return parsedClosedCaption;
  }

  /**
   * Handles RU2, RU3, RU4 - Roll-Up, N rows.
   * If in TEXT, POPON or PAINTON, any displayed captions are erased.
   *    This means must force emit entire display buffer.
   * @param {number} scrollSize New scroll window size.
   * @param {number} pts
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   * @private
   */
  controlRu_(scrollSize, pts) {
    this.curBuf_ = this.displayedMemory_;  // Point to displayed memory
    const buf = this.curBuf_;
    let parsedClosedCaption = null;

    // For any type except rollup and text mode, it should be emitted,
    // and memories cleared.
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.ROLLUP &&
        this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      parsedClosedCaption = buf.forceEmit(this.prevEndTime_, pts);

      // Clear both memories.
      this.displayedMemory_.eraseBuffer();
      this.nonDisplayedMemory_.eraseBuffer();

      // Rollup base row defaults to the last row (15).
      buf.setRow(shaka.cea.Cea608Memory.CC_ROWS);
    }
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.ROLLUP;

    // Set the new rollup window size.
    buf.setScrollSize(scrollSize);
    return parsedClosedCaption;
  }

  /**
   * Handles flash on.
   * @private
   */
  controlFon_() {
    this.curBuf_.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
        ' '.charCodeAt(0));
  }


  /**
   * Handles EDM - Erase Displayed Mem
   * Mode check:
   * EDM affects all captioning modes (but not Text mode);
   * @param {number} pts
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   * @private
   */
  controlEdm_(pts) {
    const buf = this.displayedMemory_;
    let parsedClosedCaption = null;
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      // Clearing displayed memory means we now know how long
      // its contents were displayed, so force it out.
      parsedClosedCaption = buf.forceEmit(this.prevEndTime_, pts);
    }
    buf.resetAllRows();
    return parsedClosedCaption;
  }

  /**
   * Handles RDC - Resume Direct Captions. Initiates Paint-On captioning mode.
   * RDC does not affect current display, so nothing needs to be forced out yet.
   * @param {number} pts in seconds
   * @private
   */
  controlRdc_(pts) {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.PAINTON;
    // Point to displayed memory.
    this.curBuf_ = this.displayedMemory_;

    // No scroll window now.
    this.curBuf_.setScrollSize(0);

    // The next paint-on caption needs this time as the start time.
    this.prevEndTime_ = pts;
  }


  /**
   * Handles ENM - Erase Nondisplayed Mem
   * @private
   */
  controlEnm_() {
    this.nonDisplayedMemory_.resetAllRows();
  }

  /**
   * Handles EOC - End Of Caption (flip mem)
   * This forces Pop-On mode, and swaps the displayed and nondisplayed memories.
   * @private
   * @param {number} pts
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   */
  controlEoc_(pts) {
    let parsedClosedCaption = null;
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      parsedClosedCaption =
        this.displayedMemory_.forceEmit(this.prevEndTime_, pts);
    }
    // Swap memories
    const buf = this.nonDisplayedMemory_;
    this.nonDisplayedMemory_ = this.displayedMemory_;  // Swap buffers
    this.displayedMemory_ = buf;

    // Enter Pop-On mode.
    this.controlRcl_();

    // The caption ended, and so the previous end time should be updated.
    this.prevEndTime_ = pts;
    return parsedClosedCaption;
  }

  /**
   * Handles RCL - Resume Caption Loading
   * Initiates Pop-On style captioning. No need to force anything out upon
   * entering Pop-On mode because it does not affect the current display.
   * @private
   */
  controlRcl_() {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.POPON;
    this.curBuf_ = this.nonDisplayedMemory_;
    // No scroll window now
    this.curBuf_.setScrollSize(0);
  }


  /**
   * Handles BS - BackSpace.
   * @private
   */
  controlBs_() {
    this.curBuf_.eraseChar();
  }

  /**
   * Handles TR - Text Restart.
   * Clears text buffer and resumes Text Mode.
   * @private
   */
  controlTr_() {
    this.text_.reset();
    this.controlRtd_();  // Put into text mode.
  }

  /**
   * Handles RTD - Resume Text Display.
   * Resumes text mode. No need to force anything out, because Text Mode doesn't
   * affect current display. Also, this decoder does not emit Text Mode anyway.
   * @private
   */
  controlRtd_() {
    shaka.log.warnOnce('Cea608DataChannel',
        'CEA-608 text mode entered, but is unsupported');
    this.curBuf_ = this.text_;
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.TEXT;
  }

  /**
   * Handles a Basic North American byte pair.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   */
  handleBasicNorthAmericanChar(b1, b2) {
    this.curBuf_.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, b1);
    this.curBuf_.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, b2);
  }

  /**
   * Handles an Extended Western European byte pair.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @private
   */
  handleExtendedWesternEuropeanChar_(b1, b2) {
    // Get the char set from the LSB, which is the char set toggle bit.
    const charSet = b1 & 0x01 ?
          shaka.cea.Cea608Memory.CharSet.PORTUGUESE_GERMAN:
          shaka.cea.Cea608Memory.CharSet.SPANISH_FRENCH;

    this.curBuf_.addChar(charSet, b2);
  }

  /**
   * Handles a tab offset.
   *
   * @param {number} offset
   * @private
   */
  handleOffset_(offset) {
    this.curBuf_.setOffset(offset);
  }

  /**
   * Decodes control code.
   * Three types of control codes:
   * Preamble Address Codes, Mid-Row Codes, and Miscellaneous Control Codes.
   * @param {!shaka.cea.Cea608DataChannel.Cea608Packet} ccPacket
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   */
  handleControlCode(ccPacket) {
    const b1 = ccPacket.ccData1;
    const b2 = ccPacket.ccData2;

    // FCC wants control codes transmitted twice, and that will often be
    // seen in broadcast captures. If the very next frame has a duplicate
    // control code, that duplicate is ignored. Note that this only applies
    // to the very next frame, and only for one match.
    if (this.lastCp_ === ((b1 << 8) | b2)) {
      this.lastCp_ = null;
      return null;
    }

    // Remember valid control code for checking in next frame!
    this.lastCp_ = (b1 << 8) | b2;

    if (this.isPAC_(b1, b2)) {
      this.controlPac_(b1, b2);
    } else if (this.isMidrowStyleChange_(b1, b2)) {
      this.controlMidrow_(b2);
    } else if (this.isBackgroundAttribute_(b1, b2)) {
      this.controlBackgroundAttribute_(b1, b2);
    } else if (this.isSpecialNorthAmericanChar_(b1, b2)) {
      this.curBuf_.addChar(
          shaka.cea.Cea608Memory.CharSet.SPECIAL_NORTH_AMERICAN, b2);
    } else if (this.isExtendedWesternEuropeanChar_(b1, b2)) {
      this.handleExtendedWesternEuropeanChar_(b1, b2);
    } else if (this.isMiscellaneous_(b1, b2)) {
      return this.controlMiscellaneous_(ccPacket);
    } else if (this.isOffset_(b1, b2)) {
      const offset = b2 - 0x20;
      this.handleOffset_(offset);
    }
    return null;
  }

  /**
   * Checks if this is a Miscellaneous control code.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isMiscellaneous_(b1, b2) {
    // For Miscellaneous Control Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|C|1|0|F|
    // b2 -> |0|0|1|0|X|X|X|X|
    return ((b1 & 0xf6) === 0x14) && ((b2 & 0xf0) === 0x20);
  }

  /**
   * Checks if this is a offset control code.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isOffset_(b1, b2) {
    return (b1 == 0x17 || b1 == 0x1f) && b2 >= 0x21 && b2 <= 0x23;
  }

  /**
   * Checks if this is a PAC control code.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isPAC_(b1, b2) {
    // For Preamble Address Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|X|X|X|X|
    // b2 -> |0|1|X|X|X|X|X|X|
    return ((b1 & 0xf0) === 0x10) && ((b2 & 0xc0) === 0x40);
  }

  /**
   * Checks if this is a Midrow style change control code.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isMidrowStyleChange_(b1, b2) {
    // For Midrow Control Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|C|0|0|1|
    // b2 -> |0|0|1|0|X|X|X|X|
    return ((b1 & 0xf7) === 0x11) && ((b2 & 0xf0) === 0x20);
  }

  /**
   * Checks if this is a background attribute control code.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isBackgroundAttribute_(b1, b2) {
    // For Background Attribute Codes, the bytes take the following form:
    // Bg provided: b1 -> |0|0|0|1|C|0|0|0| b2 -> |0|0|1|0|COLOR|T|
    // No Bg:       b1 -> |0|0|0|1|C|1|1|1| b2 -> |0|0|1|0|1|1|0|1|
    return (((b1 & 0xf7) === 0x10) && ((b2 & 0xf0) === 0x20)) ||
             (((b1 & 0xf7) === 0x17) && ((b2 & 0xff) === 0x2D));
  }

  /**
   * Checks if the character is in the Special North American char. set.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isSpecialNorthAmericanChar_(b1, b2) {
    // The bytes take the following form:
    // b1 -> |0|0|0|1|C|0|0|1|
    // b2 -> |0|0|1|1|  CHAR |
    return ((b1 & 0xf7) === 0x11) && ((b2 & 0xf0) === 0x30);
  }

  /**
   * Checks if the character is in the Extended Western European char. set.
   * @param {number} b1 Byte 1.
   * @param {number} b2 Byte 2.
   * @return {boolean}
   * @private
   */
  isExtendedWesternEuropeanChar_(b1, b2) {
    // The bytes take the following form:
    // b1 -> |0|0|0|1|C|0|1|S|
    // b2 -> |0|0|1|CHARACTER|
    return ((b1 & 0xf6) === 0x12) && ((b2 & 0xe0) === 0x20);
  }

  /**
   * Checks if the data contains a control code.
   * @param {number} b1 Byte 1.
   * @return {boolean}
   */
  static isControlCode(b1) {
    // For control codes, the first byte takes the following form:
    // b1 -> |P|0|0|1|X|X|X|X|
    return (b1 & 0x70) === 0x10;
  }

  /**
   * Checks if the data contains a XDS control code.
   * @param {number} b1 Byte 1.
   * @return {boolean}
   */
  static isXdsControlCode(b1) {
    return b1 >= 0x01 && b1 <= 0x0F;
  }
};

/**
 * Command codes.
 * @enum {number}
 * @private
 */
shaka.cea.Cea608DataChannel.MiscCmd_ = {
  // "RCL - Resume Caption Loading"
  RCL: 0x20,

  // "BS  - BackSpace"
  BS: 0x21,

  // "AOD - Unused (alarm off)"
  AOD: 0x22,

  // "AON - Unused (alarm on)"
  AON: 0x23,

  // "DER - Delete to End of Row"
  DER: 0x24,

  // "RU2 - Roll-Up, 2 rows"
  RU2: 0x25,

  // "RU3 - Roll-Up, 3 rows"
  RU3: 0x26,

  // "RU4 - Roll-Up, 4 rows"
  RU4: 0x27,

  // "FON - Flash On"
  FON: 0x28,

  // "RDC - Resume Direct Captions"
  RDC: 0x29,

  // "TR - Text Restart"
  TR: 0x2a,

  // "RTD - Resume Text Display"
  RTD: 0x2b,

  // "EDM - Erase Displayed Mem"
  EDM: 0x2c,

  // "CR  - Carriage return"
  CR: 0x2d,

  // "ENM - Erase Nondisplayed Mem"
  ENM: 0x2e,

  // "EOC - End Of Caption (flip mem)"
  EOC: 0x2f,
};

/**
 * Caption type.
 * @private @const @enum {number}
 */
shaka.cea.Cea608DataChannel.CaptionType = {
  NONE: 0,
  POPON: 1,
  PAINTON: 2,
  ROLLUP: 3,
  TEXT: 4,
};

/**
 * @const {!Array<string>}
 */
shaka.cea.Cea608DataChannel.BG_COLORS = [
  'black',
  'green',
  'blue',
  'cyan',
  'red',
  'yellow',
  'magenta',
  'black',
];

/**
 * @const {!Array<string>}
 */
shaka.cea.Cea608DataChannel.TEXT_COLORS = [
  'white',
  'green',
  'blue',
  'cyan',
  'red',
  'yellow',
  'magenta',
  'white_italics',
];

/**
 * Style associated with a cue.
 * @typedef {{
 *   textColor: ?string,
 *   backgroundColor: ?string,
 *   italics: ?boolean,
 *   underline: ?boolean,
 * }}
 */
shaka.cea.Cea608DataChannel.Style;

/**
 * CEA closed captions packet.
 * @typedef {{
 *   pts: number,
 *   type: number,
 *   ccData1: number,
 *   ccData2: number,
 *   order: number,
 * }}
 *
 * @property {number} pts
 *   Presentation timestamp (in second) at which this packet was received.
 * @property {number} type
 *   Type of the packet. Either 0 or 1, representing the CEA-608 field.
 * @property {number} ccData1 CEA-608 byte 1.
 * @property {number} ccData2 CEA-608 byte 2.
 * @property {number} order
 *   A number indicating the order this packet was received in a sequence
 *   of packets. Used to break ties in a stable sorting algorithm
 */
shaka.cea.Cea608DataChannel.Cea608Packet;
