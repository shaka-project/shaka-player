/**
 * @license
 * Copyright Brightcove, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.util.ExpGolomb');

goog.require('shaka.util.DataViewReader');


/**
 * @summary
 * Parser for exponential Golomb codes, a variable-bitwidth number encoding
 * scheme used by h264.
 * Based on https://github.com/videojs/mux.js/blob/main/lib/utils/exp-golomb.js
 *
 * @export
 */
shaka.util.ExpGolomb = class {
  /**
   * @param {!Uint8Array} data
   */
  constructor(data) {
    /** @private {!Uint8Array} */
    this.data_ = data;

    /** @private {number} */
    this.workingBytesAvailable_ = data.byteLength;

    // the current word being examined
    /** @private {number} */
    this.workingWord_ = 0;

    // the number of bits left to examine in the current word
    /** @private {number} */
    this.workingBitsAvailable_ = 0;
  }

  /**
   * Load the next word
   *
   * @private
   */
  loadWord_() {
    const position = this.data_.byteLength - this.workingBytesAvailable_;
    const bytes = new Uint8Array(4);
    const availableBytes = Math.min(4, this.workingBytesAvailable_);

    if (availableBytes === 0) {
      return;
    }

    bytes.set(this.data_.subarray(position, position + availableBytes));
    const dataView = new shaka.util.DataViewReader(
        bytes, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    this.workingWord_ = dataView.readUint32();

    // track the amount of data that has been processed
    this.workingBitsAvailable_ = availableBytes * 8;
    this.workingBytesAvailable_ -= availableBytes;
  }

  /**
   * Skip n bits
   *
   * @param {number} count
   */
  skipBits(count) {
    if (this.workingBitsAvailable_ <= count) {
      count -= this.workingBitsAvailable_;
      const skipBytes = Math.floor(count / 8);
      count -= (skipBytes * 8);
      this.workingBitsAvailable_ -= skipBytes;
      this.loadWord_();
    }
    this.workingWord_ <<= count;
    this.workingBitsAvailable_ -= count;
  }

  /**
   * Read n bits
   *
   * @param {number} size
   * @return {number}
   */
  readBits(size) {
    let bits = Math.min(this.workingBitsAvailable_, size);
    const valu = this.workingWord_ >>> (32 - bits);
    this.workingBitsAvailable_ -= bits;
    if (this.workingBitsAvailable_ > 0) {
      this.workingWord_ <<= bits;
    } else if (this.workingBytesAvailable_ > 0) {
      this.loadWord_();
    }
    bits = size - bits;
    if (bits > 0) {
      return (valu << bits) | this.readBits(bits);
    }
    return valu;
  }

  /**
   * Return the number of skip leading zeros
   *
   * @return {number}
   * @private
   */
  skipLeadingZeros_() {
    let i;
    for (i = 0; i < this.workingBitsAvailable_; ++i) {
      if ((this.workingWord_ & (0x80000000 >>> i)) !== 0) {
        // the first bit of working word is 1
        this.workingWord_ <<= i;
        this.workingBitsAvailable_ -= i;
        return i;
      }
    }

    // we exhausted workingWord and still have not found a 1
    this.loadWord_();
    return i + this.skipLeadingZeros_();
  }

  /**
   * Skip exponential Golomb
   */
  skipExpGolomb() {
    this.skipBits(1 + this.skipLeadingZeros_());
  }

  /**
   * Return unsigned exponential Golomb
   *
   * @return {number}
   */
  readUnsignedExpGolomb() {
    const clz = this.skipLeadingZeros_();
    return this.readBits(clz + 1) - 1;
  }

  /**
   * Return exponential Golomb
   *
   * @return {number}
   */
  readExpGolomb() {
    const valu = this.readUnsignedExpGolomb();
    if (0x01 & valu) {
      // the number is odd if the low order bit is set
      // add 1 to make it even, and divide by 2
      return (1 + valu) >>> 1;
    }
    // divide by two then make it negative
    return -1 * (valu >>> 1);
  }

  /**
   * Read 1 bit as boolean
   *
   * @return {boolean}
   */
  readBoolean() {
    return this.readBits(1) === 1;
  }

  /**
   * Read 8 bits
   *
   * @return {number}
   */
  readUnsignedByte() {
    return this.readBits(8);
  }

  /**
   * The scaling list is optionally transmitted as part of a Sequence Parameter
   * Set (SPS).
   *
   * @param {number} count the number of entries in this scaling list
   * @see Recommendation ITU-T H.264, Section 7.3.2.1.1.1
   */
  skipScalingList(count) {
    let lastScale = 8;
    let nextScale = 8;

    for (let j = 0; j < count; j++) {
      if (nextScale !== 0) {
        const deltaScale = this.readExpGolomb();
        nextScale = (lastScale + deltaScale + 256) % 256;
      }
      lastScale = (nextScale === 0) ? lastScale : nextScale;
    }
  }
};
