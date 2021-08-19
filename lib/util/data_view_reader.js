/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.DataViewReader');

goog.require('goog.asserts');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');


/**
  * @summary DataViewReader abstracts a DataView object.
  * @export
  */
shaka.util.DataViewReader = class {
  /**
   * @param {BufferSource} data
   * @param {shaka.util.DataViewReader.Endianness} endianness The endianness.
   */
  constructor(data, endianness) {
    /** @private {!DataView} */
    this.dataView_ = shaka.util.BufferUtils.toDataView(data);

    /** @private {boolean} */
    this.littleEndian_ =
        endianness == shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN;

    /** @private {number} */
    this.position_ = 0;
  }


  /** @return {!DataView} The underlying DataView instance. */
  getDataView() {
    return this.dataView_;
  }


  /**
   * @return {boolean} True if the reader has more data, false otherwise.
   * @export
   */
  hasMoreData() {
    return this.position_ < this.dataView_.byteLength;
  }


  /**
   * Gets the current byte position.
   * @return {number}
   * @export
   */
  getPosition() {
    return this.position_;
  }


  /**
   * Gets the byte length of the DataView.
   * @return {number}
   * @export
   */
  getLength() {
    return this.dataView_.byteLength;
  }


  /**
   * Reads an unsigned 8 bit integer, and advances the reader.
   * @return {number} The integer.
   * @export
   */
  readUint8() {
    try {
      const value = this.dataView_.getUint8(this.position_);
      this.position_ += 1;
      return value;
    } catch (exception) {
      throw this.outOfBounds_();
    }
  }


  /**
   * Reads an unsigned 16 bit integer, and advances the reader.
   * @return {number} The integer.
   * @export
   */
  readUint16() {
    try {
      const value =
          this.dataView_.getUint16(this.position_, this.littleEndian_);
      this.position_ += 2;
      return value;
    } catch (exception) {
      throw this.outOfBounds_();
    }
  }


  /**
   * Reads an unsigned 32 bit integer, and advances the reader.
   * @return {number} The integer.
   * @export
   */
  readUint32() {
    try {
      const value =
          this.dataView_.getUint32(this.position_, this.littleEndian_);
      this.position_ += 4;
      return value;
    } catch (exception) {
      throw this.outOfBounds_();
    }
  }


  /**
   * Reads a signed 32 bit integer, and advances the reader.
   * @return {number} The integer.
   * @export
   */
  readInt32() {
    try {
      const value = this.dataView_.getInt32(this.position_, this.littleEndian_);
      this.position_ += 4;
      return value;
    } catch (exception) {
      throw this.outOfBounds_();
    }
  }


  /**
   * Reads an unsigned 64 bit integer, and advances the reader.
   * @return {number} The integer.
   * @export
   */
  readUint64() {
    /** @type {number} */
    let low;
    /** @type {number} */
    let high;

    try {
      if (this.littleEndian_) {
        low = this.dataView_.getUint32(this.position_, true);
        high = this.dataView_.getUint32(this.position_ + 4, true);
      } else {
        high = this.dataView_.getUint32(this.position_, false);
        low = this.dataView_.getUint32(this.position_ + 4, false);
      }
    } catch (exception) {
      throw this.outOfBounds_();
    }

    if (high > 0x1FFFFF) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
    }

    this.position_ += 8;

    // NOTE: This is subtle, but in JavaScript you can't shift left by 32
    // and get the full range of 53-bit values possible.
    // You must multiply by 2^32.
    return (high * Math.pow(2, 32)) + low;
  }


  /**
   * Reads the specified number of raw bytes.
   * @param {number} bytes The number of bytes to read.
   * @return {!Uint8Array}
   * @export
   */
  readBytes(bytes) {
    goog.asserts.assert(bytes >= 0, 'Bad call to DataViewReader.readBytes');
    if (this.position_ + bytes > this.dataView_.byteLength) {
      throw this.outOfBounds_();
    }

    const value =
        shaka.util.BufferUtils.toUint8(this.dataView_, this.position_, bytes);
    this.position_ += bytes;
    return value;
  }


  /**
   * Skips the specified number of bytes.
   * @param {number} bytes The number of bytes to skip.
   * @export
   */
  skip(bytes) {
    goog.asserts.assert(bytes >= 0, 'Bad call to DataViewReader.skip');
    if (this.position_ + bytes > this.dataView_.byteLength) {
      throw this.outOfBounds_();
    }
    this.position_ += bytes;
  }


  /**
   * Rewinds the specified number of bytes.
   * @param {number} bytes The number of bytes to rewind.
   * @export
   */
  rewind(bytes) {
    goog.asserts.assert(bytes >= 0, 'Bad call to DataViewReader.rewind');
    if (this.position_ < bytes) {
      throw this.outOfBounds_();
    }
    this.position_ -= bytes;
  }


  /**
   * Seeks to a specified position.
   * @param {number} position The desired byte position within the DataView.
   * @export
   */
  seek(position) {
    goog.asserts.assert(position >= 0, 'Bad call to DataViewReader.seek');
    if (position < 0 || position > this.dataView_.byteLength) {
      throw this.outOfBounds_();
    }
    this.position_ = position;
  }


  /**
   * Keeps reading until it reaches a byte that equals to zero.  The text is
   * assumed to be UTF-8.
   * @return {string}
   * @export
   */
  readTerminatedString() {
    const start = this.position_;
    while (this.hasMoreData()) {
      const value = this.dataView_.getUint8(this.position_);
      if (value == 0) {
        break;
      }
      this.position_ += 1;
    }

    const ret = shaka.util.BufferUtils.toUint8(
        this.dataView_, start, this.position_ - start);
    // Skip string termination.
    this.position_ += 1;
    return shaka.util.StringUtils.fromUTF8(ret);
  }


  /**
   * @return {!shaka.util.Error}
   * @private
   */
  outOfBounds_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS);
  }
};

/**
 * Endianness.
 * @enum {number}
 * @export
 */
shaka.util.DataViewReader.Endianness = {
  'BIG_ENDIAN': 0,
  'LITTLE_ENDIAN': 1,
};
