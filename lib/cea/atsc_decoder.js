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
     * @private {!Array<!shaka.cea.Cea608DataChannel.CcData>}
     */
    this.ccDataArray_ = [];

    /**
     * A map containing the stream for each mode.
     * @private {!Map<!string, !shaka.cea.Cea608DataChannel>}
     */
    this.cea608ModeToStream_ = new Map([
      ['CC1', new shaka.cea.Cea608DataChannel(this, 0, 0)], // F1+C1
      ['CC2', new shaka.cea.Cea608DataChannel(this, 0, 1)], // F1+C2
      ['CC3', new shaka.cea.Cea608DataChannel(this, 1, 0)], // F2+C1
      ['CC4', new shaka.cea.Cea608DataChannel(this, 1, 1)], // F2+C2
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
   * Adds a new parsed cue to the current parsed cues list.
   * @param {!shaka.cea.ICaptionDecoder.Cue} cue
   */
  addCue(cue) {
    this.cues_.push(cue);
  }

  /**
   * @return {!Array<!shaka.cea.ICaptionDecoder.Cue>}
   */
  getCues() {
    return this.cues_;
  }

  /**
   * Clears any currently buffered cues.
   */
  clearCues() {
    this.cues_ = [];
  }

  /**
   * Clears the decoder.
   * @override
   */
  clear() {
    this.badFrames_ = 0;
    this.ccDataArray_ = [];
    this.clearCues();
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
   * Extracts closed caption bytes from CEA-X08 packets from the stream based on
   * ANSI/SCTE 128 and A/53, Part 4.
   * @override
   */
  extract(userDataSeiMessage, pts) {
    const reader = new shaka.util.DataViewReader(
        userDataSeiMessage, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

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
    // Clear previously buffered cues (which should already have been received).
    this.clearCues();

    // In some versions of Chrome, and other browsers, the default sorting
    // algorithm isn't stable. This sort breaks ties based on receive order.
    this.ccDataArray_.sort(
        /**
         * Stable sorting function.
         * @param {!shaka.cea.Cea608DataChannel.CcData} ccData1
         * @param {!shaka.cea.Cea608DataChannel.CcData} ccData2
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
   * @param {shaka.cea.Cea608DataChannel.CcData} ccPacket
   * @private
   */
  decodeCea608_(ccPacket) {
    const fieldNum = ccPacket.type;
    let b1 = ccPacket.cc1;
    let b2 = ccPacket.cc2;

    // If this packet is a control code, then it also sets the channel.
    // For control codes, cc_data_1 has the form |P|0|0|1|C|X|X|X|.
    // "C" is the channel bit. It indicates whether to set C2 active.
    if (shaka.cea.Cea608DataChannel.isControlCode(b1)) {
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
      if ((b1 === 0xff && b2 === 0xff) || (!b1 && !b2)) {
        // Completely invalid frame.  FCC says after 45 of them, reset.
        if (++this.badFrames_ >= 45) {
          this.reset();
        }
      }
    }

    // Validate the parity, cc_data_1 and cc_data_2 should be odd parity uimsbf.
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
    if (shaka.cea.Cea608DataChannel.isControlCode(b1)) {
      selectedStream.handleControlCode(ccPacket);
    } else {
      // Handle as a Basic North American Character.
      selectedStream.handleBasicNorthAmericanChar(b1, b2);
    }
  }

  /**
   * Checks if the provided byte has odd parity.
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
 * itu_t_35_provider_code for ATSC user_data
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.ATSC_PROVIDER_CODE = 0x0031;

/**
 * When provider is ATSC user data, the ATSC_user_identifier code
 * for ATSC1_data is "GA94" (0x47413934)
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.ATSC1_USER_IDENTIFIER = 0x47413934;

/**
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.NTSC_CC_FIELD_1 = 0;

/**
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.NTSC_CC_FIELD_2 = 1;

/**
 * 0xB5 is USA's code (Rec. ITU-T T.35)
 * @private @const {!number}
 */
shaka.cea.AtscDecoder.USA_COUNTRY_CODE = 0xb5;
