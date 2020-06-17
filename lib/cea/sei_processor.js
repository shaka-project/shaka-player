/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.SeiProcessor');


/**
 * H.264 SEI NALU Parser used for extracting 708 closed caption packets.
 */
shaka.cea.SeiProcessor = class {
  constructor() {
    /**
     * Length of the buffered SEI data.
     * @private {number}
     */
    this.seiLength_ = 0;

    /**
     * Buffer for the supplemental enhancement information (SEI) network
     * abstraction layer unit (NALU).
     * @private @const {!Uint8Array}
     */
    this.seiArray_ = new Uint8Array(5 * 1024);
  }


  /**
   * Clears processor state.
   */
  clear() { this.seiLength_ = 0; }


  /**
   * Returns the length of SEI data pending to be processed.
   * @return {number} Length of SEI data pending to be processed.
   */
  getLength() { return this.seiLength_; }


  /**
   * Returns whether there is enough space in the buffer for appending data
   * of length passed in.
   * @param {number} length Length of data to check for a fit.
   * @return {boolean} Whether there is enough space.
   */
  isEnoughSpace(length) {
    return this.seiLength_ + length <= this.seiArray_.length;
  }


  /**
   * Appends SEI data to buffer pending to be processed.
   * @param {!Uint8Array} byteArray Data to append to the buffer.
   */
  append(byteArray) {
    this.seiArray_.set(byteArray, this.seiLength_);
    this.seiLength_ += byteArray.length;
  }


  /**
   * Processes supplemental enhancement information data.
   * @param {number} time The timestamp for the SEI data to be processed.
   * @param {function(!BufferSource, number)} on708Data
   */
  process(time, on708Data) {
    const emuCount = this.removeEmu_();
    let offset = 0;
    while (offset + emuCount < this.seiLength_) {
      let payloadType = 0;
      while (this.seiArray_[offset] == 0xFF) {
        payloadType += 255;
        offset++;
      }
      payloadType += this.seiArray_[offset++];
      if (payloadType > 45) {
        break;
      }
      let payloadSize = 0;
      while (this.seiArray_[offset] == 0xFF) {
        payloadSize += 255;
        offset++;
      }
      payloadSize += this.seiArray_[offset++];
      if (payloadType == 4) {
        on708Data(this.seiArray_.subarray(offset, offset + payloadSize), time);
      }
      offset += payloadSize;
    }
    this.clear();
  }


  /**
   * Removes H.264 emulation prevention bytes from the byte array.
   * @return {number} The number of removed emulation prevention bytes.
   * @private
   */
  removeEmu_() {
    let zeroCount = 0;
    let src = 0;
    let dst = 0;
    while (src < this.seiLength_) {
      if (zeroCount == 2 && this.seiArray_[src] == 0x03) {
        zeroCount = 0;
      } else {
        if (this.seiArray_[src] == 0x00) {
          zeroCount++;
        } else {
          zeroCount = 0;
        }
        this.seiArray_[dst] = this.seiArray_[src];
        dst++;
      }
      src++;
    }
    return (src - dst);
  }
};
