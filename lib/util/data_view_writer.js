/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.DataViewWriter');

goog.require('goog.asserts');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Error');


/**
 * @summary DataViewWriter abstracts a growable DataView for binary writing.
 * @export
 */
shaka.util.DataViewWriter = class {
  /**
   * @param {number} initialSize
   * @param {shaka.util.DataViewWriter.Endianness} endianness The endianness.
   */
  constructor(initialSize, endianness) {
    /** @private {!Uint8Array} */
    this.buffer_ = new Uint8Array(initialSize);

    /** @private {!DataView} */
    this.dataView_ = shaka.util.BufferUtils.toDataView(this.buffer_);

    /** @private {boolean} */
    this.littleEndian_ =
        endianness == shaka.util.DataViewWriter.Endianness.LITTLE_ENDIAN;

    /** @private {number} */
    this.position_ = 0;
  }

  /** @return {number} */
  getPosition() {
    return this.position_;
  }

  /** @return {number} */
  getLength() {
    return this.position_;
  }

  /** @return {!Uint8Array} */
  getBytes() {
    return shaka.util.BufferUtils.toUint8(this.buffer_, 0, this.position_);
  }

  /**
   * Resets the position.
   */
  reset() {
    this.position_ = 0;
  }

  /**
   * @param {number} bytes
   * @private
   */
  ensureSpace_(bytes) {
    const required = this.position_ + bytes;
    if (required <= this.buffer_.length) {
      return;
    }

    const newSize = Math.max(this.buffer_.length * 2, required);
    const newBuffer = new Uint8Array(newSize);
    newBuffer.set(this.buffer_);
    this.buffer_ = newBuffer;
    this.dataView_ = shaka.util.BufferUtils.toDataView(this.buffer_);
  }

  /** @param {number} value */
  writeUint8(value) {
    this.ensureSpace_(1);
    this.dataView_.setUint8(this.position_, value & 0xff);
    this.position_ += 1;
  }

  /** @param {number} value */
  writeUint16(value) {
    this.ensureSpace_(2);
    this.dataView_.setUint16(
        this.position_, value & 0xffff, this.littleEndian_);
    this.position_ += 2;
  }

  /** @param {number} value */
  writeUint32(value) {
    this.ensureSpace_(4);
    this.dataView_.setUint32(this.position_, value >>> 0, this.littleEndian_);
    this.position_ += 4;
  }

  /** @param {number} value */
  writeUint64(value) {
    if (value < 0 || value > Number.MAX_SAFE_INTEGER) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
    }

    this.ensureSpace_(8);

    const high = Math.floor(value / 0x100000000);
    const low = value >>> 0;

    if (this.littleEndian_) {
      this.dataView_.setUint32(this.position_, low, true);
      this.dataView_.setUint32(this.position_ + 4, high, true);
    } else {
      this.dataView_.setUint32(this.position_, high, false);
      this.dataView_.setUint32(this.position_ + 4, low, false);
    }

    this.position_ += 8;
  }

  /**
   * @param {!Uint8Array} bytes
   */
  writeBytes(bytes) {
    goog.asserts.assert(bytes, 'Bad call to writeBytes');
    this.ensureSpace_(bytes.byteLength);
    const view = shaka.util.BufferUtils.toUint8(
        this.buffer_, this.position_, bytes.byteLength);
    view.set(bytes);
    this.position_ += bytes.byteLength;
  }

  /**
   * Writes a UTF-8 string prefixed by its length as uint32.
   * @param {string} str
   */
  writeString(str) {
    const bytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(str));
    this.writeUint32(bytes.length);
    this.writeBytes(bytes);
  }

  /**
   * Variable-length unsigned integer (up to 53 bits).
   * @param {number} value
   */
  writeVarInt53(value) {
    if (value < 0) {
      throw new Error(`Underflow: ${value}`);
    }

    const MAX_U6 = (1 << 6) - 1;
    const MAX_U14 = (1 << 14) - 1;
    const MAX_U30 = (1 << 30) - 1;
    const MAX_U53 = Number.MAX_SAFE_INTEGER;

    if (value <= MAX_U6) {
      // 1-byte encoding (0xxxxxxx)
      this.writeUint8(value);
    } else if (value <= MAX_U14) {
      // 2-byte encoding (10xxxxxx xxxxxxxx)
      this.writeUint8(((value >> 8) & 0x3f) | 0x40);
      this.writeUint8(value & 0xff);
    } else if (value <= MAX_U30) {
      // 4-byte encoding (110xxxxx xxxxxxxx xxxxxxxx xxxxxxxx)
      this.writeUint8(((value >> 24) & 0x1f) | 0x80);
      this.writeUint8((value >> 16) & 0xff);
      this.writeUint8((value >> 8) & 0xff);
      this.writeUint8(value & 0xff);
    } else if (value <= MAX_U53) {
      // 8-byte encoding (1110xxxx xxxxxxxx xxxxxxxx xxxxxxxx
      //                  xxxxxxxx xxxxxxxx xxxxxxxx xxxxxxxx)
      const high = Math.floor(value / 0x100000000);
      const low = value % 0x100000000;
      this.writeUint8(((high >> 24) & 0x0f) | 0xc0);
      this.writeUint8((high >> 16) & 0xff);
      this.writeUint8((high >> 8) & 0xff);
      this.writeUint8(high & 0xff);

      this.writeUint8((low >> 24) & 0xff);
      this.writeUint8((low >> 16) & 0xff);
      this.writeUint8((low >> 8) & 0xff);
      this.writeUint8(low & 0xff);
    } else {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
    }
  }

  /**
   * Variable-length unsigned integer (up to 62 bits).
   * @param {!number} value
   */
  writeVarInt62(value) {
    if (value < 0) {
      throw new Error(`Underflow: ${value}`);
    }

    if (value <= Number.MAX_SAFE_INTEGER) {
      this.writeVarInt53(value);
      return;
    }

    const v = BigInt(value);

    const maskFF = BigInt(0xff);
    const mask0F = BigInt(0x0f);
    const prefixC0 = BigInt(0xc0);

    this.ensureSpace_(8);

    this.writeUint8(Number(((v >> BigInt(56)) & mask0F) | prefixC0));
    this.writeUint8(Number((v >> BigInt(48)) & maskFF));
    this.writeUint8(Number((v >> BigInt(40)) & maskFF));
    this.writeUint8(Number((v >> BigInt(32)) & maskFF));
    this.writeUint8(Number((v >> BigInt(24)) & maskFF));
    this.writeUint8(Number((v >> BigInt(16)) & maskFF));
    this.writeUint8(Number((v >> BigInt(8)) & maskFF));
    this.writeUint8(Number(v & maskFF));
  }

  /**
   * Writes a UTF-8 string prefixed by its length as a var int (up to 53 bits).
   * @param {string} str
   */
  writeStringVarInt(str) {
    const bytes = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(str));
    this.writeVarInt53(bytes.length);
    this.writeBytes(bytes);
  }

  /**
   * @param {number} position
   */
  seek(position) {
    goog.asserts.assert(position >= 0, 'Bad seek');
    if (position > this.buffer_.length) {
      throw this.outOfBounds_();
    }
    this.position_ = position;
  }

  /**
   * @param {number} bytes
   */
  skip(bytes) {
    goog.asserts.assert(bytes >= 0, 'Bad skip');
    this.ensureSpace_(bytes);
    this.position_ += bytes;
  }

  /**
   * Reserve 2 bytes and return their position for later patching.
   * @return {number}
   */
  reserveUint16() {
    const pos = this.position_;
    this.skip(2);
    return pos;
  }

  /**
   * @param {number} position
   * @param {number} value
   */
  patchUint16(position, value) {
    const cur = this.position_;
    this.position_ = position;
    this.writeUint16(value);
    this.position_ = cur;
  }

  /**
   * @return {!shaka.util.Error}
   * @private
   */
  outOfBounds_() {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.BUFFER_WRITE_OUT_OF_BOUNDS);
  }
};


/**
 * Endianness.
 * @enum {number}
 * @export
 */
shaka.util.DataViewWriter.Endianness = {
  'BIG_ENDIAN': 0,
  'LITTLE_ENDIAN': 1,
};
