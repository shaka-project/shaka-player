/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.DtvccPacketBuilder');
goog.provide('shaka.cea.DtvccPacket');
goog.require('shaka.util.Error');
goog.requireType('shaka.cea.Cea708Service');


/**
 * CEA-708 DTVCC Packet Builder.
 * Builds packets based on Figure 5 CCP State Table in 5.2 of CEA-708-E.
 * Initially, there is no packet. When a DTVCC_PACKET_START payload is received,
 * a packet begins construction. The packet is considered "built" once all bytes
 * indicated in the header are read, and ignored if a new packet starts building
 * before the current packet is finished being built.
 */
shaka.cea.DtvccPacketBuilder = class {
  /** */
  constructor() {
    /**
     * An array containing built DTVCC packets that are ready to be processed.
     * @private {!Array<!shaka.cea.DtvccPacket>}
     */
    this.builtPackets_ = [];

    /**
     * Stores the packet data for the current packet being processed, if any.
     * @private {?Array<!shaka.cea.Cea708Service.Cea708Byte>}
     */
    this.currentPacketBeingBuilt_ = null;

    /**
     * Keeps track of the number of bytes left to add in the current packet.
     * @private {number}
     */
    this.bytesLeftToAddInCurrentPacket_ = 0;
  }

  /**
   * @param {!shaka.cea.Cea708Service.Cea708Byte} cea708Byte
   */
  addByte(cea708Byte) {
    if (cea708Byte.type === shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_START) {
      // If there was a packet being built that finished, it would have
      // already been added to the built packets when it finished. So if
      // there's an open packet at this point, it must be unfinished. As
      // per the spec, we don't deal with unfinished packets. So we ignore them.

      // A new packet should be opened.
      const packetSize = cea708Byte.value & 0x3f;

      // As per spec, number of packet data bytes to follow is packetSize*2-1.
      this.bytesLeftToAddInCurrentPacket_ = packetSize * 2 - 1;
      this.currentPacketBeingBuilt_ = [];
      return;
    }

    if (!this.currentPacketBeingBuilt_) {
      // There is no packet open. Then an incoming byte should not
      // have come in at all. Ignore it.
      return;
    }

    if (this.bytesLeftToAddInCurrentPacket_ > 0) {
      this.currentPacketBeingBuilt_.push(cea708Byte);
      this.bytesLeftToAddInCurrentPacket_--;
    }

    if (this.bytesLeftToAddInCurrentPacket_ === 0) {
      // Current packet is complete and ready for processing.
      const packet = new shaka.cea.DtvccPacket(this.currentPacketBeingBuilt_);
      this.builtPackets_.push(packet);
      this.currentPacketBeingBuilt_ = null;
      this.bytesLeftToAddInCurrentPacket_ = 0;
    }
  }

  /**
   * @return {!Array<!shaka.cea.DtvccPacket>}
   */
  getBuiltPackets() {
    return this.builtPackets_;
  }

  /** Clear built packets. */
  clearBuiltPackets() {
    this.builtPackets_ = [];
  }

  /** Clear built packets and packets in progress. */
  clear() {
    this.builtPackets_ = [];
    this.currentPacketBeingBuilt_ = [];
    this.bytesLeftToAddInCurrentPacket_ = 0;
  }
};


shaka.cea.DtvccPacket = class {
  /**
   * @param {!Array<!shaka.cea.Cea708Service.Cea708Byte>} packetData
   */
  constructor(packetData) {
    /**
     * Keeps track of the position to read the next byte from in the packet.
     * @private {number}
     */
    this.pos_ = 0;

    /**
     * Bytes that represent the data in the DTVCC packet.
     * @private {!Array<!shaka.cea.Cea708Service.Cea708Byte>}
     */
    this.packetData_ = packetData;
  }

  /**
   * @return {boolean}
   */
  hasMoreData() {
    return this.pos_ < this.packetData_.length;
  }

  /**
   * @return {number}
   */
  getPosition() {
    return this.pos_;
  }

  /**
   * Reads a byte from the packet. TODO CONSIDER RENAMING THIS TO BLOCK
   * @return {!shaka.cea.Cea708Service.Cea708Byte}
   * @throws {!shaka.util.Error}
   */
  readByte() {
    if (!this.hasMoreData()) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS);
    }
    return this.packetData_[this.pos_++];
  }

  /**
   * Skips the provided number of blocks in the buffer.
   * @param {number} numBlocks
   * @throws {!shaka.util.Error}
   */
  skip(numBlocks) {
    if (this.pos_ + numBlocks > this.packetData_.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS);
    }
    this.pos_ += numBlocks;
  }
};

/**
 * @const {number}
 */
shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA = 2;

/**
 * @const {number}
 */
shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_START = 3;
