/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.CeaDecoder');

goog.require('shaka.cea.Cea608DataChannel');
goog.require('shaka.cea.Cea708Service');
goog.require('shaka.cea.DtvccPacketBuilder');
goog.require('shaka.cea.ICaptionDecoder');
goog.require('shaka.log');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.requireType('shaka.cea.DtvccPacket');


/**
 * CEA-X08 captions decoder. Currently only CEA-608 supported.
 * @implements {shaka.cea.ICaptionDecoder}
 */
shaka.cea.CeaDecoder = class {
  /** */
  constructor() {
    /**
     * An array of CEA-608 closed caption data extracted for decoding.
     * @private {!Array<!shaka.cea.Cea608DataChannel.Cea608Packet>}
     */
    this.cea608DataArray_ = [];

    /**
     * An array of CEA-708 closed caption data extracted for decoding.
     * @private {!Array<!shaka.cea.Cea708Service.Cea708Byte>}
     */
    this.cea708DataArray_ = [];

    /**
     * A DTVCC Packet builder for CEA-708 data.
     * @private {!shaka.cea.DtvccPacketBuilder}
     */
    this.dtvccPacketBuilder_ = new shaka.cea.DtvccPacketBuilder();

    /**
     * Number of consecutive bad frames decoded on CEA-608.
     * @private {number}
     */
    this.badFrames_ = 0;

    /**
     * A map containing the stream for each mode.
     * @private {!Map<string, !shaka.cea.Cea608DataChannel>}
     */
    this.cea608ModeToStream_ = new Map([
      ['CC1', new shaka.cea.Cea608DataChannel(0, 0)], // F1 + C1 -> CC1
      ['CC2', new shaka.cea.Cea608DataChannel(0, 1)], // F1 + C2 -> CC2
      ['CC3', new shaka.cea.Cea608DataChannel(1, 0)], // F2 + C1 -> CC3
      ['CC4', new shaka.cea.Cea608DataChannel(1, 1)], // F2 + C2 -> CC4
    ]);

    /**
     * The current channel that is active on CEA-608 field 1.
     * @private {number}
     */
    this.currentField1Channel_ = 0;

    /**
     * The current channel that is active on CEA-608 field 2.
     * @private {number}
     */
    this.currentField2Channel_ = 0;

    /**
     * Map of service number to CEA-708 services, initially empty. Since there
     * can be up to 63 services, they are created dynamically only when needed.
     * @private {!Map<number, shaka.cea.Cea708Service>}
     */
    this.serviceNumberToService_ = new Map();

    this.reset();
  }

  /**
   * Clears the decoder.
   * @override
   */
  clear() {
    this.badFrames_ = 0;
    this.cea608DataArray_ = [];
    this.cea708DataArray_ = [];
    this.dtvccPacketBuilder_.clear();
    this.reset();

    // Clear all the CEA-708 services.
    for (const service of this.serviceNumberToService_.values()) {
      service.clear();
    }
  }

  /**
   * Resets the decoder.
   */
  reset() {
    this.currentField1Channel_ = 0;
    this.currentField2Channel_ = 0;
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

    if (reader.readUint8() !== shaka.cea.CeaDecoder.USA_COUNTRY_CODE) {
      return;
    }
    if (reader.readUint16() !== shaka.cea.CeaDecoder.ATSC_PROVIDER_CODE) {
      return;
    }
    if (reader.readUint32() !== shaka.cea.CeaDecoder.ATSC1_USER_IDENTIFIER) {
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
      const ccData1 = reader.readUint8();
      const ccData2 = reader.readUint8();

      if (ccValid) {
        const ccType = cc & 0x03;
        // Send the packet to the appropriate data array (CEA-608 or CEA-708).
        if (ccType === shaka.cea.CeaDecoder.NTSC_CC_FIELD_1 ||
            ccType === shaka.cea.CeaDecoder.NTSC_CC_FIELD_2) {
          // CEA-608 NTSC (Line 21) Data.
          this.cea608DataArray_.push({
            pts,
            type: ccType,
            ccData1,
            ccData2,
            order: this.cea608DataArray_.length,
          });
        } else {
          // CEA-708 DTVCC Data.
          this.cea708DataArray_.push({
            pts,
            type: ccType,
            value: ccData1,
            order: this.cea708DataArray_.length,
          });

          // The second byte should always be labelled as DTVCC packet data.
          // Even if this pair was a DTVCC packet start, only the first byte
          // contains header info, and the second byte is just packet data.
          this.cea708DataArray_.push({
            pts,
            type: shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA,
            value: ccData2,
            order: this.cea708DataArray_.length,
          });
        }
      }
    }
  }

  /**
   * Decodes extracted closed caption data.
   * @override
   */
  decode() {
    /** @type {!Array.<!shaka.cea.ICaptionDecoder.ClosedCaption>} */
    const parsedClosedCaptions = [];

    // In some versions of Chrome, and other browsers, the default sorting
    // algorithm isn't stable. This comparator sorts on presentation
    // timestamp, and breaks ties on receive order (position in array).
    const stableComparator =
      (p1, p2) => (p1.pts - p2.pts) || (p1.order - p2.order);

    this.cea608DataArray_.sort(stableComparator);
    this.cea708DataArray_.sort(stableComparator);

    // CEA-608 packets are just byte pairs. Decode all of them.
    for (const cea608Packet of this.cea608DataArray_) {
      const parsedClosedCaption = this.decodeCea608_(cea608Packet);
      if (parsedClosedCaption) {
        parsedClosedCaptions.push(parsedClosedCaption);
      }
    }

    // CEA-708 packets are DTVCC packets composed of many byte pairs. Add all
    // byte pairs to the packet builder, and process + clear any ready packets.
    for (const cea708Byte of this.cea708DataArray_) {
      this.dtvccPacketBuilder_.addByte(cea708Byte);
    }
    const dtvccPackets = this.dtvccPacketBuilder_.getBuiltPackets();
    for (const dtvccPacket of dtvccPackets) {
      const closedCaptions = this.decodeCea708_(dtvccPacket);
      parsedClosedCaptions.push(...closedCaptions);
    }

    // Clear all processed data.
    this.dtvccPacketBuilder_.clearBuiltPackets();
    this.cea608DataArray_ = [];
    this.cea708DataArray_ = [];

    return parsedClosedCaptions;
  }

  /**
   * Decodes a CEA-608 closed caption packet based on ANSI/CEA-608.
   * @param {shaka.cea.Cea608DataChannel.Cea608Packet} ccPacket
   * @return {?shaka.cea.ICaptionDecoder.ClosedCaption}
   * @private
   */
  decodeCea608_(ccPacket) {
    const fieldNum = ccPacket.type;

    // If this packet is a control code, then it also sets the channel.
    // For control codes, cc_data_1 has the form |P|0|0|1|C|X|X|X|.
    // "C" is the channel bit. It indicates whether to set C2 active.
    if (shaka.cea.Cea608DataChannel.isControlCode(ccPacket.ccData1)) {
      const channelNum = (ccPacket.ccData1 >> 3) & 0x01; // Get channel bit.

      // Change the stream based on the field, and the new channel
      if (fieldNum === 0) {
        this.currentField1Channel_ = channelNum;
      } else {
        this.currentField2Channel_ = channelNum;
      }
    }

    // Get the correct stream for this caption packet (CC1, ..., CC4)
    const selectedChannel = fieldNum ?
        this.currentField2Channel_ : this.currentField1Channel_;
    const selectedMode = `CC${(fieldNum << 1) | selectedChannel + 1}`;
    const selectedStream = this.cea608ModeToStream_.get(selectedMode);

    // Check for bad frames (bad pairs). This can be two 0xff, two 0x00, or any
    // byte of even parity. ccData1 and ccData2 should be uint8 of odd parity.
    if ((ccPacket.ccData1 === 0xff && ccPacket.ccData2 === 0xff) ||
        (!ccPacket.ccData1 && !ccPacket.ccData2) ||
        !this.isOddParity_(ccPacket.ccData1) ||
        !this.isOddParity_(ccPacket.ccData2)) {
      // Per CEA-608-B C.21, reset the memory after 45 consecutive bad frames.
      if (++this.badFrames_ >= 45) {
        this.reset();
      }
      return null;
    }
    this.badFrames_ = 0;

    // Remove the MSB (parity bit).
    ccPacket.ccData1 &= 0x7f;
    ccPacket.ccData2 &= 0x7f;

    // Check for empty captions and skip them.
    if (!ccPacket.ccData1 && !ccPacket.ccData2) {
      return null;
    }

    // Process the clean CC data pair.
    let parsedClosedCaption = null;
    if (shaka.cea.Cea608DataChannel.isControlCode(ccPacket.ccData1)) {
      parsedClosedCaption = selectedStream.handleControlCode(ccPacket);
    } else {
      // Handle as a Basic North American Character.
      selectedStream.handleBasicNorthAmericanChar(
          ccPacket.ccData1, ccPacket.ccData2);
    }

    return parsedClosedCaption;
  }

  /**
   * Decodes a CEA-708 DTVCC packet based on ANSI/CTA-708-E.
   * @param {shaka.cea.DtvccPacket} dtvccPacket
   * @return {!Array<!shaka.cea.ICaptionDecoder.ClosedCaption>}
   * @private
   */
  decodeCea708_(dtvccPacket) {
    const parsedClosedCaptions = [];
    try {
      while (dtvccPacket.hasMoreData()) {
        // Process a service block.
        const serviceBlockHeader = dtvccPacket.readByte().value;

        // First 3 bits are service number, next 5 are block size,
        // representing the number of bytes coming in this block
        // (discluding a possible extended service block header byte)
        let serviceNumber = (serviceBlockHeader & 0xe0) >> 5;
        const blockSize = serviceBlockHeader & 0x1f;

        if (serviceNumber === /* 0b111 */ 0x07 && blockSize != 0) {
          // 2 bits null padding, 6 bits extended service number
          const extendedServiceBlockHeader = dtvccPacket.readByte().value;
          serviceNumber = extendedServiceBlockHeader & 0x3f;
        }

        // As per CEA-708-E, service number 0 is invalid, and should be ignored.
        if (serviceNumber != 0) {
          // If the service doesn't already exist, create it.
          if (!this.serviceNumberToService_.has(serviceNumber)) {
            const service = new shaka.cea.Cea708Service(serviceNumber);
            this.serviceNumberToService_.set(serviceNumber, service);
          }
          const service = this.serviceNumberToService_.get(serviceNumber);

          // Process all control codes.
          const startPos = dtvccPacket.getPosition();

          // Execute this loop `blockSize` times, to decode the control codes.
          while (dtvccPacket.getPosition() - startPos < blockSize) {
            const closedCaption = service.handleCea708ControlCode(dtvccPacket);
            if (closedCaption) {
              parsedClosedCaptions.push(closedCaption);
            }
          }  // position < end of block
        }  // serviceNumber != 0
      }  // hasMoreData
    } catch (error) {
      if (error instanceof shaka.util.Error &&
      error.code === shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS) {
        shaka.log.warnOnce('CEA708_INVALID_DATA',
            'Buffer read out of bounds / invalid CEA-708 Data.');
      } else {
        // This is an unexpected error, and should be rethrown.
        throw error;
      }
    }
    return parsedClosedCaptions;
  }

  /**
   * Checks if a byte has odd parity (Odd number of 1s in binary).
   * @param {number} byte
   * @return {boolean} True if the byte has odd parity.
   * @private
   */
  isOddParity_(byte) {
    let parity = 0;
    while (byte) {
      parity ^= (byte & 1); // toggle parity if low bit is 1
      byte >>= 1; // shift away the low bit
    }
    return parity === 1;
  }
};

/**
 * itu_t_35_provider_code for ATSC user_data
 * @private @const {number}
 */
shaka.cea.CeaDecoder.ATSC_PROVIDER_CODE = 0x0031;

/**
 * When provider is ATSC user data, the ATSC_user_identifier code
 * for ATSC1_data is "GA94" (0x47413934)
 * @private @const {number}
 */
shaka.cea.CeaDecoder.ATSC1_USER_IDENTIFIER = 0x47413934;

/**
 * @private @const {number}
 */
shaka.cea.CeaDecoder.NTSC_CC_FIELD_1 = 0;

/**
 * @private @const {number}
 */
shaka.cea.CeaDecoder.NTSC_CC_FIELD_2 = 1;

/**
 * 0xB5 is USA's code (Rec. ITU-T T.35)
 * @private @const {number}
 */
shaka.cea.CeaDecoder.USA_COUNTRY_CODE = 0xb5;
