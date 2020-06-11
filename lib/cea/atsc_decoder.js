/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.AtscDecoder');

/**
 * CEA-X08 captions decoder. Currently only CEA-608 supported.
 * @implements {shaka.cea.ICaptionDecoder}
 */
shaka.cea.AtscDecoder = class {
  constructor() {
    /**
     * Contains parsed cues.
     * @type {!Array.<!shaka.cea.ICaptionDecoder.Cue>}
     */
    this.cues_ = [];

    /**
     * Number of bad frames decoded in a row.
     * @private {!number}
     */
    this.badFrames_ = 0;

    /**
     * An array of closed captions data extracted for decoding.
     * @private {!Array<!shaka.cea.AtscDecoder.CcData>}
     */
    this.ccDataArray_ = [];

    /**
     * A map containing the stream for each mode.
     * @private {!Map<!string, !shaka.cea.AtscDecoder.Cea608DataChannel>}
     */
    this.cea608ModeToStream_ = new Map([
      ['CC1', new shaka.cea.AtscDecoder.Cea608DataChannel(this, 0, 0)], // F1+C1
      ['CC2', new shaka.cea.AtscDecoder.Cea608DataChannel(this, 0, 1)], // F1+C2
      ['CC3', new shaka.cea.AtscDecoder.Cea608DataChannel(this, 1, 0)], // F2+C1
      ['CC4', new shaka.cea.AtscDecoder.Cea608DataChannel(this, 1, 1)], // F2+C2
    ]);

    /**
     * The current channel that is active on Line 21 (CEA-608) field 1.
     * @private {!number}
     */
    this.line21Field1Channel_ = 0;

    /**
     * The current channel that is active on Line 21 (CEA-608) field 2.
     * @private {!number}
     */
    this.line21Field2Channel_ = 0;

    this.reset();
  }

  /**
   * Adds a new parsed cue to the current parsed cues list
   * @param {!shaka.cea.ICaptionDecoder.Cue} cue
   */
  addCue(cue) {
    this.cues_.push(cue);
  }

  /**
   * Clears the decoder.
   * @override
   */
  clear() {
    this.badFrames_ = 0;
    this.ccDataArray_ = [];
    this.cues_ = [];
    this.reset();
  }

  /**
   * Resets the decoder.
   */
  reset() {
    this.line21Field1Channel_ = 0;
    this.line21Field2Channel_ = 0;
    for (const stream of this.cea608ModeToStream_.values()) {
      stream.reset();
    }
  }

  /**
   * Extracts closed caption bytes from CEA-608 parsed from the stream based on
   * ANSI/SCTE 128 and A/53, Part 4.
   * @param {!Uint8Array} closedCaptionData
   * This is a User Data registered by Rec.ITU-T T.35 SEI message.
   * It is described in sections D.1.6 and D.2.6 of Rec. ITU-T H.264 (06/2019).
   * @param {!number} pts PTS when this packet was received, in seconds.
   * @override
   */
  extract(closedCaptionData, pts) {
    const reader = new shaka.util.DataViewReader(
        closedCaptionData, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

    if (reader.readUint8() !== shaka.cea.AtscDecoder.USA_COUNTRY_CODE) {
      return;
    }
    if (reader.readUint16() !== shaka.cea.AtscDecoder.ATSC_PROVIDER_CODE) {
      return;
    }
    if (reader.readUint32() !== shaka.cea.AtscDecoder.ATSC1_USER_IDENTIFIER) {
      return;
    }

    // user_data_type_code: 0x03 - cc_data()
    if (reader.readUint8() !== 0x03) {
      return;
    }

    // 1 bit reserved
    // 1 bit process_cc_data_flag
    // 1 bit zero_bit
    // 5 bits cc_count
    const captionData = reader.readUint8();
    // If process_cc_data_flag is not set, do not process this data.
    if ((captionData & 0x40) === 0) {
      return;
    }

    const count = captionData & 0x1f;

    // 8 bits reserved
    reader.skip(1);

    for (let i = 0; i < count; i++) {
      const cc = reader.readUint8();
      // When ccValid is 0, the next two bytes should be discarded.
      const ccValid = (cc & 0x04) >> 2;
      const cc1 = reader.readUint8();
      const cc2 = reader.readUint8();

      if (ccValid) {
        const ccType = cc & 0x03;
        const ccData = {
          pts,
          type: ccType,
          cc1: cc1,
          cc2: cc2,
          order: this.ccDataArray_.length,
        };
        this.ccDataArray_.push(ccData);
      }
    }
  }

  /**
   * Decodes extracted closed caption data.
   * @override
   */
  decode() {
    // Clear previously buffered cues (which should already have been received)
    this.cues_ = [];

    // In some versions of Chrome, and other browsers, the default sorting
    // algorithm isn't stable. This sort breaks ties based on receive order.
    this.ccDataArray_.sort(
        /**
         * Stable sorting function.
         * @param {!shaka.cea.AtscDecoder.CcData} ccData1
         * @param {!shaka.cea.AtscDecoder.CcData} ccData2
         * @return {!number}
         */
        (ccData1, ccData2) => {
          const diff = ccData1.pts - ccData2.pts;
          const isEqual = diff === 0;
          return isEqual ? ccData1.order - ccData2.order : diff;
        });

    for (const ccPacket of this.ccDataArray_) {
      // Only consider packets that are NTSC line 21 (CEA-608).
      // Types 2 and 3 contain DVTCC data, for a future CEA-708 decoder.
      if (ccPacket.type === shaka.cea.AtscDecoder.NTSC_CC_FIELD_1 ||
          ccPacket.type === shaka.cea.AtscDecoder.NTSC_CC_FIELD_2) {
        this.decodeCea608_(ccPacket);
      }
    }

    this.ccDataArray_.length = 0;
    return this.cues_;
  }

  /**
   * Decodes a CEA-608 closed caption packet based on ANSI/CEA-608.
   * @param {shaka.cea.AtscDecoder.CcData} ccPacket
   * @private
   */
  decodeCea608_(ccPacket) {
    const fieldNum = ccPacket.type;
    let b1 = ccPacket.cc1;
    let b2 = ccPacket.cc2;

    // If this packet is a control code, then it also sets the channel.
    // For control codes, cc_data_1 has the form |P|0|0|1|C|X|X|X|.
    // "C" is the channel bit. It indicates whether to set C2 active.
    if (shaka.cea.AtscDecoder.Cea608DataChannel.isControlCode(b1)) {
      const channelNum = (b1 >> 3) & 0x01; // Get channel bit.

      // Change the stream based on the field, and the new channel
      if (fieldNum === 0) {
        this.line21Field1Channel_ = channelNum;
      } else {
        this.line21Field2Channel_ = channelNum;
      }
    }

    // Get the correct stream for this caption packet (CC1, ..., CC4)
    const selectedChannel = fieldNum ?
        this.line21Field2Channel_ : this.line21Field1Channel_;
    const selectedMode = `CC${(fieldNum << 1) | selectedChannel + 1}`;
    const selectedStream = this.cea608ModeToStream_.get(selectedMode);

    // If on field 1, check if there are too many bad frames
    if (fieldNum === 0) {
      if ((b1 === 0xFF && b2 === 0xFF) || (!b1 && !b2)) {
        // Completely invalid frame.  FCC says after 45 of them, reset.
        if (++this.badFrames_ >= 45) {
          this.reset();
        }
      }
    }

    // Validate the parity
    if (!this.isOddParity_(b1) || !this.isOddParity_(b2)) {
      return;
    }

    // Remove the MSB (parity bit).
    ccPacket.cc1 = (b1 &= 0x7f);
    ccPacket.cc2 = (b2 &= 0x7f);

    // Check for empty captions and skip them.
    if (!b1 && !b2) {
      return;
    }

    // Process the clean CC data pair.
    if (shaka.cea.AtscDecoder.Cea608DataChannel.isControlCode(b1)) {
      selectedStream.handleControlCode(ccPacket);
    } else {
      // Handle as a Basic North American Character.
      selectedStream.handleBasicNorthAmericanChar(b1, b2);
    }
  }

  /**
   * Checks if the provided byte has odd parity,
   * @param {!number} byte
   * @return {!boolean} True if the byte has odd parity.
   * @private
   */
  isOddParity_(byte) {
    let parity = 0;
    while (byte) {
      parity ^= 1;
      byte &= (byte - 1);
    }
    return parity === 1;
  }
};

/**
 * CEA-608 captions memory/buffer.
 */
shaka.cea.AtscDecoder.Cea608Memory = class {
  /**
   * @param {!shaka.cea.AtscDecoder} decoder CEA-608 decoder.
   * @param {!number} fieldNum Field number.
   * @param {!number} chanNum Channel number.
   */
  constructor(decoder, fieldNum, chanNum) {
    /**
     * Buffer for storing decoded characters.
     * @private @const {!Array<!string>}
     */
    this.rows_ = [];

    /**
     * Current row.
     * @private {!number}
     */
    this.row = 0;

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
    this.textmode_ = false;

    /**
     * Maps row to currently open style tags (italics, underlines, colors).
     * @private {!Map<!number, !Array<!string>>}
     */
    this.midrowStyleTags_ = new Map();

    /**
     * Current background color for each row.
     * @private {!Map<!number, !string>}
     */
    this.backgroundColors_ = new Map();

    /**
     * CEA-608 decoder.
     * @private @const {!shaka.cea.AtscDecoder}
     */
    this.decoder_ = decoder;

    this.resetAllRows();

    // Text mode currently not emitted, so it is unused.
    shaka.util.Functional.ignored(this.textmode_);
  }

  /**
   * Emits a cue based on the state of the buffer.
   * @param {!number} startTime Start time of the cue.
   * @param {!number} endTime End time of the cue.
   */
  forceEmit(startTime, endTime) {
    // Ensure all style tags are closed
    this.closeAndClearMidrowStyleTags();
    this.clearBackgroundColor();

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
   * @param {!number} fldnum field number.
   * @param {!number} chnum channel number (0 or 1 within this field).
   * @param {!boolean} textmode indicates whether text mode is on.
   */
  reset(fldnum, chnum, textmode) {
    this.resetAllRows();
    this.fldnum_ = fldnum;
    this.chnum_ = chnum;
    this.textmode_ = textmode;
    this.row = 1;
  }

  /**
   * Opens the supplied style tag at the current position.
   * @param {!string} tag
   */
  openMidrowStyleTag(tag) {
    if (!this.midrowStyleTags_.has(this.row)) {
      this.midrowStyleTags_.set(this.row, []);
    }
    this.rows_[this.row] += `<${tag}>`;
    this.midrowStyleTags_.get(this.row).push(tag);
  }

  /**
   * Closes and clears all currently active style tags.
   */
  closeAndClearMidrowStyleTags() {
    if (!this.midrowStyleTags_.has(this.row)) {
      return;
    }
    const openStylesForRow = this.midrowStyleTags_.get(this.row);

    // Close tags in the reverse order of which they were opened.
    for (let i = openStylesForRow.length -1; i >= 0; i--) {
      this.rows_[this.row] += `</${openStylesForRow[i][0]}>`;
    }
    openStylesForRow.length = 0;
  }

  /**
   * Sets the supplied background color on the current row.
   * @param {!string} color
   */
  setBackgroundColor(color) {
    this.backgroundColors_.set(this.row, color);
    this.rows_[this.row] += `<c.bg_${color}>`;
  }

  /**
   * Clears background color on the current row.
   */
  clearBackgroundColor() {
    if (!this.backgroundColors_.has(this.row)) {
      return;
    }
    this.rows_[this.row] += `</c>`;
    this.backgroundColors_.delete(this.row);
  }

  /**
   * Adds a character to the buffer.
   * @param {!shaka.cea.AtscDecoder.CharSet} set Character set.
   * @param {!number} b CC byte to add.
   */
  addChar(set, b) {
    // Valid chars are in the range [0x20, 0x7f]
    if (b < 0x20 || b > 0x7f) {
      return;
    }

    let char = '';
    switch (set) {
      case shaka.cea.AtscDecoder.CharSet.BASIC_NORTH_AMERICAN:
        if (shaka.cea.AtscDecoder.Cea608Memory.BasicNorthAmericanChars.has(b)) {
          char =
              shaka.cea.AtscDecoder.Cea608Memory.BasicNorthAmericanChars.get(b);
        } else {
          // Regular ASCII
          char = String.fromCharCode(b);
        }
        break;
      case shaka.cea.AtscDecoder.CharSet.SPECIAL_NORTH_AMERICAN:
        char =
            shaka.cea.AtscDecoder.Cea608Memory.SpecialNorthAmericanChars.get(b);
        break;
      case shaka.cea.AtscDecoder.CharSet.SPANISH_FRENCH:
        // Extended charset does a BS over preceding char, 6.4.2 EIA-608-B.
        this.eraseChar();
        char =
            shaka.cea.AtscDecoder.Cea608Memory.ExtendedSpanishFrench.get(b);
        break;
      case shaka.cea.AtscDecoder.CharSet.PORTUGUESE_GERMAN:
        this.eraseChar();
        char =
            shaka.cea.AtscDecoder.Cea608Memory.ExtendedPortugueseGerman.get(b);
        break;
    }

    if (char) {
      this.rows_[this.row] += char;
    }
  }

  /**
   * Erases a character from the buffer.
   */
  eraseChar() {
    const rowText = this.rows_[this.row];

    // Unicode Aware - makes use of string's iterator.
    this.rows_[this.row] = Array.from(rowText).slice(0, -1).join('');
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
      if (this.midrowStyleTags_.has(src + i)) {
        this.midrowStyleTags_.set(dst + i, this.midrowStyleTags_.get(src + i));
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
      this.midrowStyleTags_.delete(idx + i);
    }
  }

  /**
   * Resets the entire memory buffer.
   */
  resetAllRows() {
    this.resetRows(0, shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS);
  }

  /**
   * Erases entire memory buffer.
   * Doesn't change scroll state or number of rows.
   */
  eraseBuffer() {
    this.row = (this.scrollRows_ > 0) ? this.scrollRows_ : 1;
    this.resetAllRows();
  }
};

/**
 * 608 closed captions channel.
 */
shaka.cea.AtscDecoder.Cea608DataChannel = class {
  /**
   * @param {!shaka.cea.AtscDecoder} decoder CEA-608 decoder.
   * @param {!number} fieldNum Field number.
   * @param {!number} chanNum Channel number.
   */
  constructor(decoder, fieldNum, chanNum) {
    /**
     * CEA-608 decoder.
     * @private @const {!shaka.cea.AtscDecoder}
     */
    this.decoder_ = decoder;

    /**
     * 0 for chan 1 (CC1, CC3), 1 for chan 2 (CC2, CC4)
     * @public {number}
     */
    this.chnum = chanNum;

    /**
     * Field number.
     * @private {!number}
     */
    this.fldnum_ = fieldNum;

    /**
     * Current Caption Type.
     * @public {!shaka.cea.AtscDecoder.CaptionType}
     */
    this.type_ = shaka.cea.AtscDecoder.CaptionType.NONE;

    /**
     * Text buffer. Although we have this, we don't currently emit text mode.
     * @private @const {!shaka.cea.AtscDecoder.Cea608Memory}
     */
    this.text_ =
      new shaka.cea.AtscDecoder.Cea608Memory(decoder, fieldNum, chanNum);

    /**
     * Displayed memory.
     * @private {!shaka.cea.AtscDecoder.Cea608Memory}
     */
    this.dpm_ =
      new shaka.cea.AtscDecoder.Cea608Memory(decoder, fieldNum, chanNum);

    /**
     * Non-displayed memory.
     * @private {!shaka.cea.AtscDecoder.Cea608Memory}
     */
    this.ndm_ =
      new shaka.cea.AtscDecoder.Cea608Memory(decoder, fieldNum, chanNum);

    /**
     * Points to current buffer.
     * @public {!shaka.cea.AtscDecoder.Cea608Memory}
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
    this.type_ = shaka.cea.AtscDecoder.CaptionType.PAINTON;
    this.curbuf = this.dpm_;
    this.lastcp_ = null;
    this.dpm_.reset(this.fldnum_, this.chnum, false);
    this.ndm_.reset(this.fldnum_, this.chnum, false);
    this.text_.reset(this.fldnum_, this.chnum, true);
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
    let row = shaka.cea.AtscDecoder.Cea608DataChannel.ccpac2row_(b1, b2);

    // PACs change rows, and should reset styles of current row before doing so.
    this.curbuf.closeAndClearMidrowStyleTags();

    // Get attribute bits (4 bits)
    const attr = (b2 & 0x1E) >> 1;

    // Set up the defaults.
    let textColor = null; // No color i.e default white
    let italics = false;


    // Attributes < 7 are colors, = 7 is white w/ italics, and >7 are indents
    if (attr < 7) {
      textColor = shaka.cea.AtscDecoder.TEXT_COLORS[attr];
    } else if (attr === 7) {
      italics = true; // color stays white
    }

    // PACs toggle underline on the last bit of b2.
    const underline = (b2 & 0x01) === 0x01;

    // Execute the PAC.
    const buf = this.curbuf;
    if (this.type_ === shaka.cea.AtscDecoder.CaptionType.TEXT) {
      row = buf.row; // Don't change row if in text mode.
    } else if (this.type_ === shaka.cea.AtscDecoder.CaptionType.ROLLUP) {
      if (row !== buf.row) { // Move the entire scroll window to a new base.
        const oldtoprow = 1 + buf.row - buf.scrollRows_;
        const newtoprow = 1 + row - buf.scrollRows_;

        // Shift up the scroll window.
        buf.moveRows(newtoprow, oldtoprow, buf.scrollRows_);

        // Clear everything outside of the new scroll window.
        buf.resetRows(0, newtoprow - 1);
        buf.resetRows(row + 1,
            shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS - row);
      }
    }
    buf.row = row;

    // Apply all styles to rows.
    if (underline) {
      this.curbuf.openMidrowStyleTag('u');
    }
    if (italics) {
      this.curbuf.openMidrowStyleTag('i');
    }
    if (textColor) {
      this.curbuf.openMidrowStyleTag(`c.${textColor}`);
    }
  }

  /**
   * Mid-Row control code handler.
   * @param {!number} b2 Byte #2.
   */
  controlMidrow(b2) {
    // This style will override any previous styles applied to this row.
    this.curbuf.closeAndClearMidrowStyleTags();

    // Mid-row attrs use a space.
    this.curbuf.addChar(
        shaka.cea.AtscDecoder.CharSet.BASIC_NORTH_AMERICAN, ' '.charCodeAt(0));

    let textColor = null; // No color i.e default white.
    let italics = false;

    // Midrow codes set underline on last (LSB) bit.
    const underline = (b2 & 0x01) === 0x01;

    // b2 has the form |P|0|1|0|STYLE|U|
    textColor = shaka.cea.AtscDecoder.TEXT_COLORS[(b2 & 0xe) >> 1];
    if (textColor === 'white_italics') {
      textColor = null;
      italics = true;
    }

    if (underline) {
      this.curbuf.openMidrowStyleTag('u');
    }
    if (italics) {
      this.curbuf.openMidrowStyleTag('i');
    }
    if (textColor) {
      this.curbuf.openMidrowStyleTag(`c.${textColor}`);
    }
  }

  /**
   * Background attribute control code handler.
   * @param {!number} b1 Byte #1
   * @param {!number} b2 Byte #2.
   */
  controlBackgroundAttribute(b1, b2) {
    this.curbuf.clearBackgroundColor();

    let backgroundColor = null; // Default black.
    if ((b1 & 0x07) === 0x0) {
      // Provided background, last 3 bits of b1 are |0|0|0|. Color is in b2.
      backgroundColor = shaka.cea.AtscDecoder.BG_COLORS[(b2 & 0xe) >> 1];
    }

    if (backgroundColor) {
      this.curbuf.setBackgroundColor(backgroundColor);
    }
  }

  /**
   * The Cea608DataChannel control methods implement all CC control operations.
   * @param {!shaka.cea.AtscDecoder.CcData} ccPacket
   */
  controlMiscellaneous(ccPacket) {
    const b2 = ccPacket.cc2;
    const pts = ccPacket.pts;
    switch (b2) {
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RCL:
        this.controlRcl_();
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.BS:
        this.controlBs_();
        break;
      // unused (alarm off and alarm on)
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.AOD:
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.AON:
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.DER:
        // Delete to End of Row. Not implemented since position not supported.
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RU2:
        this.controlRu_(2, pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RU3:
        this.controlRu_(3, pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RU4:
        this.controlRu_(4, pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.FON:
        this.controlFon_();
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RDC:
        this.controlRdc_(pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.TR:
        this.controlTr_();
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.RTD:
        this.controlRtd_();
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.EDM:
        this.controlEdm_(pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.CR:
        this.controlCr_(pts);
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.ENM:
        this.controlEnm_();
        break;
      case shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_.EOC:
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
    if (this.type_ !== shaka.cea.AtscDecoder.CaptionType.ROLLUP) {
      return;
    }
    // Force out the scroll window since the top row will cleared.
    buf.forceEmit(this.prevEndTime_, pts);

    // Calculate the top of the scroll window.
    const toprow = (buf.row - buf.scrollRows_) + 1;

    // Shift up the window one row higher.
    buf.moveRows(toprow - 1, toprow, buf.scrollRows_);

    // Clear out anything that's outside of our current scroll window.
    buf.resetRows(0, toprow - 1);
    buf.resetRows(buf.row,
        shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS - buf.row );

    // Update the end time so the next caption emits starting at this time.
    this.prevEndTime_ = pts;
  }

  /**
   * Handles RU2, RU3, RU4 - Roll-Up, N rows.
   * If in TEXT, POPON or PAINTON, any displayed captions are erased.
   *    This means must force emit of entire display buffer.
   * @param {!number} scrollSize New scroll window size.
   * @param {!number} pts
   * @private
   */
  controlRu_(scrollSize, pts) {
    this.curbuf = this.dpm_;  // Point to displayed memory
    const buf = this.curbuf;

    // For any type except rollup, it should be emitted, and memories cleared.
    switch (this.type_) {
      case shaka.cea.AtscDecoder.CaptionType.TEXT:
        if (buf.scrollRows_ > 0) {
          // Was in Text mode, but display mem is already scroll window,
          // so don't need to force or clear anything.
          break;
        }
        // Else drop through to clear displayed mem
        // eslint-disable-next-line no-fallthrough
      case shaka.cea.AtscDecoder.CaptionType.POPON:
      case shaka.cea.AtscDecoder.CaptionType.PAINTON:
        // Force out any buffered disp mem
        buf.forceEmit(this.prevEndTime_, pts);

        // Clear BOTH memories!
        this.dpm_.eraseBuffer();
        this.ndm_.eraseBuffer();

        // Rollup base row defaults to the last one (15).
        buf.row = shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS;

        break;
    }

    this.type_ = shaka.cea.AtscDecoder.CaptionType.ROLLUP;

    // Set the new rollup window size.
    buf.scrollRows_ = scrollSize;
  }

  /**
   * Handles flash on.
   * @private
   */
  controlFon_() {
    this.curbuf.addChar(
        shaka.cea.AtscDecoder.CharSet.BASIC_NORTH_AMERICAN, ' '.charCodeAt(0));
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
    if (this.type_ !== shaka.cea.AtscDecoder.CaptionType.TEXT) {
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
    this.type_ = shaka.cea.AtscDecoder.CaptionType.PAINTON;
    // Point to displayed memory
    this.curbuf = this.dpm_;

    // No scroll window now
    this.curbuf.scrollRows_ = 0;

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
    this.type_ = shaka.cea.AtscDecoder.CaptionType.POPON;
    this.curbuf = this.ndm_;
    // No scroll window now
    this.curbuf.scrollRows_ = 0;
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
    buf.scrollRows_ = shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS;
    buf.eraseBuffer();
    this.controlRtd_();  // Put into text mode
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
        shaka.cea.AtscDecoder.CharSet.BASIC_NORTH_AMERICAN, b1);
    this.curbuf.addChar(
        shaka.cea.AtscDecoder.CharSet.BASIC_NORTH_AMERICAN, b2);
  }

  /**
   * Handles an Extended Western European byte pair.
   * @param {!number} b1 Byte 1.
   * @param {!number} b2 Byte 2.
   */
  handleExtendedWesternEuropeanChar(b1, b2) {
    // Get the char set from the LSB, which is the char set toggle bit.
    const charSet = b1 & 0x01 ?
        shaka.cea.AtscDecoder.CharSet.PORTUGUESE_GERMAN:
        shaka.cea.AtscDecoder.CharSet.SPANISH_FRENCH;

    this.curbuf.addChar(charSet, b2);
  }

  /**
   * Decodes control code.
   * Three types of control codes:
   * Preamble Address Codes, Mid-Row Codes, and Miscellaneous Control Codes.
   * @param {!shaka.cea.AtscDecoder.CcData} ccPacket
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
          shaka.cea.AtscDecoder.CharSet.SPECIAL_NORTH_AMERICAN, b2);
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
    return ((b1 & 0xF6) === 0x14) && ((b2 & 0xF0) === 0x20);
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
    return ((b1 & 0xF0) === 0x10) && ((b2 & 0xC0) === 0x40);
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
    return ((b1 & 0xF7) === 0x11) && ((b2 & 0xF0) === 0x20);
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
    return (((b1 & 0xF7) === 0x10) && ((b2 & 0xF0) === 0x20)) ||
           (((b1 & 0xF7) === 0x17) && ((b2 & 0xFF) === 0x2D));
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
    return ((b1 & 0xF7) === 0x11) && ((b2 & 0xF0) === 0x30);
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
    return ((b1 & 0xF6) === 0x12) && ((b2 & 0xE0) === 0x20);
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
shaka.cea.AtscDecoder.Cea608DataChannel.MiscCmd_ = {
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
  TR: 0x2A,

  // "RTD - Resume Text Display"
  RTD: 0x2B,

  // "EDM - Erase Displayed Mem"
  EDM: 0x2C,

  // "CR  - Carriage return"
  CR: 0x2D,

  // "ENM - Erase Nondisplayed Mem"
  ENM: 0x2E,

  // "EOC - End Of Caption (flip mem)"
  EOC: 0x2F,
};

/**
 * Caption type.
 * @private @const @enum {!number}
 */
shaka.cea.AtscDecoder.CaptionType = {
  NONE: 0,
  POPON: 1,
  PAINTON: 2,  // From here on are all "painty" (painton)
  ROLLUP: 3,   // From here on are all "rolly" (rollup)
  TEXT: 4,
};

/**
 * Characters sets.
 * @const @enum {!number}
 */
shaka.cea.AtscDecoder.CharSet = {
  BASIC_NORTH_AMERICAN: 0,
  SPECIAL_NORTH_AMERICAN: 1,
  SPANISH_FRENCH: 2,
  PORTUGUESE_GERMAN: 3,
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
shaka.cea.AtscDecoder.CcData;

shaka.cea.AtscDecoder.NTSC_CC_FIELD_1 = 0;

shaka.cea.AtscDecoder.NTSC_CC_FIELD_2 = 1;

// 0xB5 is USA's code (Rec. ITU-T T.35)
shaka.cea.AtscDecoder.USA_COUNTRY_CODE = 0xb5;

// Verify the itu_t_35_provider_code is for ATSC user_data
shaka.cea.AtscDecoder.ATSC_PROVIDER_CODE = 0x0031;

// When provider is ATSC user data, the ATSC_user_identifier code
// for ATSC1_data is "GA94" (0x47413934)
shaka.cea.AtscDecoder.ATSC1_USER_IDENTIFIER = 0x47413934;

/**
 * @const {!Array<?string>}
 */
shaka.cea.AtscDecoder.BG_COLORS = [
  null, // default (black)
  'green',
  'blue',
  'cyan',
  'red',
  'yellow',
  'magenta',
  null, // black
];

/**
 * @const {!Array<?string>}
 */
shaka.cea.AtscDecoder.TEXT_COLORS = [
  null, // default (white)
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
shaka.cea.AtscDecoder.Style;

/**
 * Maximum number of rows in the buffer.
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.Cea608Memory.CC_ROWS = 15;

/**
 * Basic North American char set deviates from ASCII with these exceptions.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.AtscDecoder.Cea608Memory.BasicNorthAmericanChars = new Map([
  [0x2a, 'á'], [0x5c, 'é'], [0x5c, 'é'], [0x5e, 'í'], [0x5f, 'ó'], [0x60, 'ú'],
  [0x7b, 'ç'], [0x7c, '÷'], [0x7d, 'Ñ'], [0x7e, 'ñ'], [0x7f, '█'],
]);

/**
 * Special North American char set.
 * Note: Transparent Space is currently implemented as a regular space.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.AtscDecoder.Cea608Memory.SpecialNorthAmericanChars = new Map([
  [0x30, '®'], [0x31, '°'], [0x32, '½'], [0x33, '¿'], [0x34, '™'], [0x35, '¢'],
  [0x36, '£'], [0x37, '♪'], [0x38, 'à'], [0x39, '⠀'], [0x3a, 'è'], [0x3b, 'â'],
  [0x3c, 'ê'], [0x3d, 'î'], [0x3e, 'ô'], [0x3f, 'û'],
]);

/**
 * Extended Spanish/Misc/French char set.
 * @private @const {!Map<!number, !string>}
 */
shaka.cea.AtscDecoder.Cea608Memory.ExtendedSpanishFrench = new Map([
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
shaka.cea.AtscDecoder.Cea608Memory.ExtendedPortugueseGerman = new Map([
  [0x20, 'Ã'], [0x21, 'ã'], [0x22, 'Í'], [0x23, 'Ì'], [0x24, 'ì'], [0x25, 'Ò'],
  [0x26, 'ò'], [0x27, 'Õ'], [0x28, 'õ'], [0x29, '{'], [0x2a, '}'], [0x2b, '\\'],
  [0x2c, '^'], [0x2d, '_'], [0x2e, '|'], [0x2f, '~'], [0x30, 'Ä'], [0x31, 'ä'],
  [0x32, 'Ö'], [0x33, 'ö'], [0x34, 'ß'], [0x35, '¥'], [0x36, '¤'], [0x37, '¦'],
  [0x38, 'Å'], [0x39, 'å'], [0x3a, 'Ø'], [0x3b, 'ø'], [0x3c, '+'], [0x3d, '+'],
  [0x3e, '+'], [0x3f, '+'],
]);
