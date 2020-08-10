/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.Cea608DataChannel');

/**
 * 608 closed captions channel.
 */
shaka.cea.Cea608DataChannel = class {
  /**
   * @param {!shaka.cea.CeaDecoder} decoder CEA-608 decoder.
   * @param {!number} fieldNum Field number.
   * @param {!number} chanNum Channel number.
   */
  constructor(decoder, fieldNum, chanNum) {
    /**
     * Current Caption Type.
     * @public {!shaka.cea.Cea608DataChannel.CaptionType}
     */
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.NONE;

    /**
     * Text buffer. Although we have this, we don't currently emit text mode.
     * @private @const {!shaka.cea.Cea608Memory}
     */
    this.text_ =
        new shaka.cea.Cea608Memory(decoder, fieldNum, chanNum, true);

    /**
     * Displayed memory.
     * @private {!shaka.cea.Cea608Memory}
     */
    this.dpm_ =
        new shaka.cea.Cea608Memory(decoder, fieldNum, chanNum, false);

    /**
     * Non-displayed memory.
     * @private {!shaka.cea.Cea608Memory}
     */
    this.ndm_ =
        new shaka.cea.Cea608Memory(decoder, fieldNum, chanNum, false);

    /**
     * Points to current buffer.
     * @public {!shaka.cea.Cea608Memory}
     */
    this.curbuf = this.dpm_;

    /**
     * End time of the previous caption, serves as start time of next caption.
     * @private {!number}
     */
    this.prevEndTime_ = 0;

    /**
     * Last control pair, 16 bits representing byte 1 and byte 2
     * @private {?number}
     */
    this.lastcp_ = null;
  }

  /**
   * Resets channel state.
   */
  reset() {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.PAINTON;
    this.curbuf = this.dpm_;
    this.lastcp_ = null;
    this.dpm_.reset();
    this.ndm_.reset();
    this.text_.reset();
  }

  /**
   * Converts Preamble Address Code to a Row Index.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!number} Row index.
   * @private
   */
  static ccpac2row_(b1, b2) {
    const ccrowtab = [
      11, 11,  // 0x00 or 0x01
      1, 2,    // 0x02 -> 0x03
      3, 4,    // 0x04 -> 0x05
      12, 13,  // 0x06 -> 0x07
      14, 15,  // 0x08 -> 0x09
      5, 6,    // 0x0A -> 0x0B
      7, 8,    // 0x0C -> 0x0D
      9, 10,   // 0x0E -> 0x0F
    ];
    return ccrowtab[((b1 & 0x07) << 1) | ((b2 >> 5) & 0x01)];
  }

  /**
   * PAC - Preamble Address Code.
   * b1 is of the form |P|0|0|1|C|0|ROW|
   * b2 is of the form |P|1|N|ATTRIBUTE|U|
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   */
  controlPac(b1, b2) {
    let row = shaka.cea.Cea608DataChannel.ccpac2row_(b1, b2);

    // PACs change rows, and should reset styles of current row before doing so,
    // except for background tags which should be left untouched.
    this.curbuf.closeMatchingStyleTags(new RegExp('^(?!.*bg)'));

    // Get attribute bits (4 bits)
    const attr = (b2 & 0x1E) >> 1;

    // Set up the defaults.
    let textColor = 'white'; // Default white.
    let italics = false;


    // Attributes < 7 are colors, = 7 is white w/ italics, and >7 are indents
    if (attr < 7) {
      textColor = shaka.cea.Cea608DataChannel.TEXT_COLORS[attr];
    } else if (attr === 7) {
      italics = true; // color stays white
    }

    // PACs toggle underline on the last bit of b2.
    const underline = (b2 & 0x01) === 0x01;

    // Execute the PAC.
    const buf = this.curbuf;
    if (this.type_ === shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      row = buf.getRow(); // Don't change row if in text mode.
    } else if (this.type_ === shaka.cea.Cea608DataChannel.CaptionType.ROLLUP) {
      if (row !== buf.getRow()) { // Move entire scroll window to a new base.
        const oldtoprow = 1 + buf.getRow() - buf.getScrollSize();
        const newtoprow = 1 + row - buf.getScrollSize();

        // Shift up the scroll window.
        buf.moveRows(newtoprow, oldtoprow, buf.getScrollSize());

        // Clear everything outside of the new scroll window.
        buf.resetRows(0, newtoprow - 1);
        buf.resetRows(row + 1,
            shaka.cea.Cea608Memory.CC_ROWS - row);
      }
    }
    buf.setRow(row);

    // Apply all styles to rows.
    if (underline) {
      this.curbuf.openStyleTag('u');
    }
    if (italics) {
      this.curbuf.openStyleTag('i');
    }
    if (textColor && textColor !== 'white') {
      this.curbuf.openStyleTag(`c.${textColor}`);
    }
  }

  /**
   * Mid-Row control code handler.
   * @param {!number} b2 Byte #2.
   */
  controlMidrow(b2) {
    // This style will override any previous styles applied to this row,
    // except for background attributes which midrow doesn't control.
    this.curbuf.closeMatchingStyleTags(new RegExp('^(?!.*bg)'));

    // Mid-row attrs use a space.
    this.curbuf.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, ' '.charCodeAt(0));

    let textColor = 'white'; // Default white.
    let italics = false;

    // Midrow codes set underline on last (LSB) bit.
    const underline = (b2 & 0x01) === 0x01;

    // b2 has the form |P|0|1|0|STYLE|U|
    textColor = shaka.cea.Cea608DataChannel.TEXT_COLORS[(b2 & 0xe) >> 1];
    if (textColor === 'white_italics') {
      textColor = 'white';
      italics = true;
    }

    if (underline) {
      this.curbuf.openStyleTag('u');
    }
    if (italics) {
      this.curbuf.openStyleTag('i');
    }
    if (textColor && textColor !== 'white') {
      this.curbuf.openStyleTag(`c.${textColor}`);
    }
  }

  /**
   * Background attribute control code handler.
   * @param {!number} b1 Byte #1
   * @param {!number} b2 Byte #2.
   */
  controlBackgroundAttribute(b1, b2) {
    // We need to clear only background tags.
    this.curbuf.closeMatchingStyleTags(new RegExp('bg'));

    let backgroundColor = 'black'; // Default black.
    if ((b1 & 0x07) === 0x0) {
      // Provided background, last 3 bits of b1 are |0|0|0|. Color is in b2.
      backgroundColor = shaka.cea.Cea608DataChannel.BG_COLORS[(b2 & 0xe) >> 1];
    }

    if (backgroundColor && backgroundColor !== 'black') {
      this.curbuf.openStyleTag(`c.bg_${backgroundColor}`);
    }
  }

  /**
   * The Cea608DataChannel control methods implement all CC control operations.
   * @param {!shaka.cea.Cea608DataChannel.CcData} ccPacket
   */
  controlMiscellaneous(ccPacket) {
    const b2 = ccPacket.cc2;
    const pts = ccPacket.pts;
    switch (b2) {
      case shaka.cea.Cea608DataChannel.MiscCmd_.RCL:
        this.controlRcl_();
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.BS:
        this.controlBs_();
        break;
        // unused (alarm off and alarm on)
      case shaka.cea.Cea608DataChannel.MiscCmd_.AOD:
      case shaka.cea.Cea608DataChannel.MiscCmd_.AON:
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.DER:
        // Delete to End of Row. Not implemented since position not supported.
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.RU2:
        this.controlRu_(2, pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.RU3:
        this.controlRu_(3, pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.RU4:
        this.controlRu_(4, pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.FON:
        this.controlFon_();
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.RDC:
        this.controlRdc_(pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.TR:
        this.controlTr_();
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.RTD:
        this.controlRtd_();
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.EDM:
        this.controlEdm_(pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.CR:
        this.controlCr_(pts);
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.ENM:
        this.controlEnm_();
        break;
      case shaka.cea.Cea608DataChannel.MiscCmd_.EOC:
        this.controlEoc_(pts);
        break;
    }
  }

  /**
   * Handles CR - Carriage Return (Start new row).
   * CR only affects scroll windows (Rollup and Text modes).
   * Any currently buffered line needs to be emitted, along
   * with a window scroll action.
   * @param {!number} pts in seconds.
   * @private
   */
  controlCr_(pts) {
    const buf = this.curbuf;
    // Only rollup and text mode is affected, but we don't emit text mode.
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.ROLLUP) {
      return;
    }
    // Force out the scroll window since the top row will cleared.
    buf.forceEmit(this.prevEndTime_, pts);

    // Calculate the top of the scroll window.
    const toprow = (buf.getRow() - buf.getScrollSize()) + 1;

    // Shift up the window one row higher.
    buf.moveRows(toprow - 1, toprow, buf.getScrollSize());

    // Clear out anything that's outside of our current scroll window.
    buf.resetRows(0, toprow - 1);
    buf.resetRows(buf.getRow(),
        shaka.cea.Cea608Memory.CC_ROWS - buf.getRow() );

    // Update the end time so the next caption emits starting at this time.
    this.prevEndTime_ = pts;
  }

  /**
   * Handles RU2, RU3, RU4 - Roll-Up, N rows.
   * If in TEXT, POPON or PAINTON, any displayed captions are erased.
   *    This means must force emit entire display buffer.
   * @param {!number} scrollSize New scroll window size.
   * @param {!number} pts
   * @private
   */
  controlRu_(scrollSize, pts) {
    this.curbuf = this.dpm_;  // Point to displayed memory
    const buf = this.curbuf;

    // For any type except rollup, it should be emitted, and memories cleared.
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.ROLLUP) {
      buf.forceEmit(this.prevEndTime_, pts);

      // Clear both memories.
      this.dpm_.eraseBuffer();
      this.ndm_.eraseBuffer();

      // Rollup base row defaults to the last row (15).
      buf.setRow(shaka.cea.Cea608Memory.CC_ROWS);
    }
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.ROLLUP;

    // Set the new rollup window size.
    buf.setScrollSize(scrollSize);
  }

  /**
   * Handles flash on.
   * @private
   */
  controlFon_() {
    this.curbuf.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
        ' '.charCodeAt(0));
  }


  /**
   * Handles EDM - Erase Displayed Mem
   * Mode check:
   * EDM affects all captioning modes (but not Text mode);
   * @param {!number} pts
   * @private
   */
  controlEdm_(pts) {
    const buf = this.dpm_;
    if (this.type_ !== shaka.cea.Cea608DataChannel.CaptionType.TEXT) {
      // Clearing displayed memory means we now know how long
      // its contents were displayed, so force it out.
      buf.forceEmit(this.prevEndTime_, pts);
    }
    buf.resetAllRows();
  }

  /**
   * Handles RDC - Resume Direct Captions. Initiates Paint-On captioning mode.
   * RDC does not affect current display, so nothing needs to be forced out yet.
   * @param {!number} pts in seconds
   * @private
   */
  controlRdc_(pts) {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.PAINTON;
    // Point to displayed memory.
    this.curbuf = this.dpm_;

    // No scroll window now.
    this.curbuf.setScrollSize(0);

    // The next paint-on caption needs this time as the start time.
    this.prevEndTime_ = pts;
  }


  /**
   * Handles ENM - Erase Nondisplayed Mem
   * @private
   */
  controlEnm_() { this.ndm_.resetAllRows(); }

  /**
   * Handles EOC - End Of Caption (flip mem)
   * This forces Pop-On mode, and swaps the displayed and nondisplayed memories.
   * @private
   * @param {!number} pts
   */
  controlEoc_(pts) {
    this.dpm_.forceEmit(this.prevEndTime_, pts);
    // Swap memories
    const buf = this.ndm_;
    this.ndm_ = this.dpm_;  // Swap buffers
    this.dpm_ = buf;

    // Enter Pop-On mode.
    this.controlRcl_();

    // The caption ended, and so the previous end time should be updated.
    this.prevEndTime_ = pts;
  }

  /**
   * Handles RCL - Resume Caption Loading
   * Initiates Pop-On style captioning. No need to force anything out upon
   * entering Pop-On mode because it does not affect the current display.
   * @private
   */
  controlRcl_() {
    this.type_ = shaka.cea.Cea608DataChannel.CaptionType.POPON;
    this.curbuf = this.ndm_;
    // No scroll window now
    this.curbuf.setScrollSize(0);
  }


  /**
   * Handles BS - BackSpace.
   * @private
   */
  controlBs_() {
    this.curbuf.eraseChar();
  }

  /**
   * Handles TR - Text Restart.
   * Clears text buffer and resumes Text Mode.
   * @private
   */
  controlTr_() {
    const buf = this.text_;

    // Window for text mode is the entire screen i.e. all of the rows.
    buf.setScrollSize(shaka.cea.Cea608Memory.CC_ROWS);
    buf.eraseBuffer();
    this.controlRtd_();  // Put into text mode.
  }

  /**
   * Handles RTD - Resume Text Display.
   * Resumes text mode. Mo need to force anything out, because Text Mode doesn't
   * affect the current display. Also, this decoder does not emit TEXTn anyway.
   * @private
   */
  controlRtd_() {
    this.curbuf = this.text_;
  }

  /**
   * Handles a Basic North American byte pair.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   */
  handleBasicNorthAmericanChar(b1, b2) {
    this.curbuf.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, b1);
    this.curbuf.addChar(
        shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, b2);
  }

  /**
   * Handles an Extended Western European byte pair.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   */
  handleExtendedWesternEuropeanChar(b1, b2) {
    // Get the char set from the LSB, which is the char set toggle bit.
    const charSet = b1 & 0x01 ?
          shaka.cea.Cea608Memory.CharSet.PORTUGUESE_GERMAN:
          shaka.cea.Cea608Memory.CharSet.SPANISH_FRENCH;

    this.curbuf.addChar(charSet, b2);
  }

  /**
   * Decodes control code.
   * Three types of control codes:
   * Preamble Address Codes, Mid-Row Codes, and Miscellaneous Control Codes.
   * @param {!shaka.cea.Cea608DataChannel.CcData} ccPacket
   */
  handleControlCode(ccPacket) {
    const b1 = ccPacket.cc1;
    const b2 = ccPacket.cc2;

    // FCC wants control codes transmitted twice, and that will often be
    // seen in broadcast captures. If the very next frame has a duplicate
    // control code, that duplicate is ignored. Note that this only applies
    // to the very next frame, and only for one match.
    if (this.lastcp_ === ((b1 << 8) | b2)) {
      this.lastcp_ = null;
      return;
    }

    // Remember valid control code for checking in next frame!
    this.lastcp_ = (b1 << 8) | b2;

    if (this.isPAC(b1, b2)) {
      this.controlPac(b1, b2);
    } else if (this.isMidrowStyleChange(b1, b2)) {
      this.controlMidrow(b2);
    } else if (this.isBackgroundAttribute(b1, b2)) {
      this.controlBackgroundAttribute(b1, b2);
    } else if (this.isSpecialNorthAmericanChar(b1, b2)) {
      this.curbuf.addChar(
          shaka.cea.Cea608Memory.CharSet.SPECIAL_NORTH_AMERICAN, b2);
    } else if (this.isExtendedWesternEuropeanChar(b1, b2)) {
      this.handleExtendedWesternEuropeanChar(b1, b2);
    } else if (this.isMiscellaneous(b1, b2)) {
      this.controlMiscellaneous(ccPacket);
    }
  }

  /**
   * Checks if this is a Miscellaneous control code.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isMiscellaneous(b1, b2) {
    // For Miscellaneous Control Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|C|1|0|F|
    // b2 -> |0|0|1|0|X|X|X|X|
    return ((b1 & 0xf6) === 0x14) && ((b2 & 0xf0) === 0x20);
  }

  /**
   * Checks if this is a PAC control code.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isPAC(b1, b2) {
    // For Preamble Address Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|X|X|X|X|
    // b2 -> |0|1|X|X|X|X|X|X|
    return ((b1 & 0xf0) === 0x10) && ((b2 & 0xc0) === 0x40);
  }

  /**
   * Checks if this is a Midrow style change control code.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isMidrowStyleChange(b1, b2) {
    // For Midrow Control Codes, the bytes take the following form:
    // b1 -> |0|0|0|1|C|0|0|1|
    // b2 -> |0|0|1|0|X|X|X|X|
    return ((b1 & 0xf7) === 0x11) && ((b2 & 0xf0) === 0x20);
  }

  /**
   * Checks if this is a background attribute control code.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isBackgroundAttribute(b1, b2) {
    // For Background Attribute Codes, the bytes take the following form:
    // Bg provided: b1 -> |0|0|0|1|C|0|0|0| b2 -> |0|0|1|0|COLOR|T|
    // No Bg:       b1 -> |0|0|0|1|C|1|1|1| b2 -> |0|0|1|0|1|1|0|1|
    return (((b1 & 0xf7) === 0x10) && ((b2 & 0xf0) === 0x20)) ||
             (((b1 & 0xf7) === 0x17) && ((b2 & 0xff) === 0x2D));
  }

  /**
   * Checks if the character is in the Special North American char. set.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isSpecialNorthAmericanChar(b1, b2) {
    // The bytes take the following form:
    // b1 -> |0|0|0|1|C|0|0|1|
    // b2 -> |0|0|1|1|  CHAR |
    return ((b1 & 0xf7) === 0x11) && ((b2 & 0xf0) === 0x30);
  }

  /**
   * Checks if the character is in the Extended Western European char. set.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   * @return {!boolean}
   */
  isExtendedWesternEuropeanChar(b1, b2) {
    // The bytes take the following form:
    // b1 -> |0|0|0|1|C|0|1|S|
    // b2 -> |0|0|1|CHARACTER|
    return ((b1 & 0xf6) === 0x12) && ((b2 & 0xe0) === 0x20);
  }

  /**
   * Checks if the data contains a control code.
   * @param {!number} b1 Byte 1.
   * @return {!boolean}
   */
  static isControlCode(b1) {
    // For control codes, the first byte takes the following form:
    // b1 -> |P|0|0|1|X|X|X|X|
    return (b1 & 0x70) === 0x10;
  }
};

/**
 * Command codes.
 * @enum {!number}
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
 * @private @const @enum {!number}
 */
shaka.cea.Cea608DataChannel.CaptionType = {
  NONE: 0,
  POPON: 1,
  PAINTON: 2,  // From here on are all "painty" (painton)
  ROLLUP: 3,   // From here on are all "rolly" (rollup)
  TEXT: 4,
};

/**
 * 608 closed captions data - time, byte 1, byte 2, and the order in which the
 * data was received.
 * @typedef {{
 *   pts: number,
 *   type: number,
 *   cc1: number,
 *   cc2: number,
 *   order: number
 * }}
 */
shaka.cea.Cea608DataChannel.CcData;

/**
 * @const {!Array<?string>}
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
 * @const {!Array<?string>}
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
 *   underline: ?boolean
 * }}
 */
shaka.cea.Cea608DataChannel.Style;
