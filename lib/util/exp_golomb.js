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

goog.require('shaka.util.BufferUtils');


/**
 * @summary
 * Parser for exponential Golomb codes, a variable-bit width number encoding
 * scheme used by h264.
 * Based on https://github.com/videojs/mux.js/blob/main/lib/utils/exp-golomb.js
 *
 * @export
 */
shaka.util.ExpGolomb = class {
  /**
   * @param {!Uint8Array} data
   * @param {boolean=} convertEbsp2rbsp
   */
  constructor(data, convertEbsp2rbsp = false) {
    /** @private {!Uint8Array} */
    this.data_ = data;
    if (convertEbsp2rbsp) {
      this.data_ = this.ebsp2rbsp_(data);
    }

    /** @private {number} */
    this.workingBytesAvailable_ = this.data_.byteLength;

    // the current word being examined
    /** @private {number} */
    this.workingWord_ = 0;

    // the number of bits left to examine in the current word
    /** @private {number} */
    this.workingBitsAvailable_ = 0;
  }

  /**
   * @param {!Uint8Array} data
   * @return {!Uint8Array}
   * @private
   */
  ebsp2rbsp_(data) {
    const ret = new Uint8Array(data.byteLength);
    let retIndex = 0;

    for (let i = 0; i < data.byteLength; i++) {
      if (i >= 2) {
        // Unescape: Skip 0x03 after 00 00
        if (data[i] == 0x03 && data[i - 1] == 0x00 && data[i - 2] == 0x00) {
          continue;
        }
      }
      ret[retIndex] = data[i];
      retIndex++;
    }

    return shaka.util.BufferUtils.toUint8(ret, 0, retIndex);
  }

  /**
   * Load the next word
   *
   * @private
   */
  loadWord_() {
    const position = this.data_.byteLength - this.workingBytesAvailable_;
    const availableBytes = Math.min(4, this.workingBytesAvailable_);

    if (availableBytes === 0) {
      return;
    }

    let word = 0;
    for (let i = 0; i < availableBytes; i++) {
      word = (word << 8) | this.data_[position + i];
    }

    // Build a 32-bit word from up to 4 bytes (big-endian order).
    // If fewer than 4 bytes remain, the missing least-significant
    // bytes are padded with zeros by shifting the partial word left.
    this.workingWord_ = word << ((4 - availableBytes) * 8);
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
    let leadingZeros = 0;
    while (this.workingBitsAvailable_ === 0) {
      if (this.workingBytesAvailable_ === 0) {
        return leadingZeros;
      }
      this.loadWord_();
    }

    while (true) {
      let clz = Math.clz32(this.workingWord_);
      if (clz > this.workingBitsAvailable_) {
        clz = this.workingBitsAvailable_;
      }

      leadingZeros += clz;
      this.workingWord_ <<= clz;
      this.workingBitsAvailable_ -= clz;

      if (this.workingBitsAvailable_ > 0 || this.workingBytesAvailable_ === 0) {
        break;
      }

      this.loadWord_();
    }

    return leadingZeros;
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

  /**
   * Return the slice type
   *
   * @return {number}
   */
  readSliceType() {
    // skip Nalu type
    this.readUnsignedByte();
    // discard first_mb_in_slice
    this.readUnsignedExpGolomb();
    // return slice_type
    return this.readUnsignedExpGolomb();
  }
};
