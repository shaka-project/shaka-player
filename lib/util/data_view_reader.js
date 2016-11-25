/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.provide('shaka.util.DataViewReader');

goog.require('goog.asserts');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');



/**
 * Creates a DataViewReader, which abstracts a DataView object.
 *
 * @param {!DataView} dataView The DataView.
 * @param {shaka.util.DataViewReader.Endianness} endianness The endianness.
 *
 * @struct
 * @constructor
 */
shaka.util.DataViewReader = function(dataView, endianness) {
  /** @private {!DataView} */
  this.dataView_ = dataView;

  /** @private {boolean} */
  this.littleEndian_ =
      endianness == shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN;

  /** @private {number} */
  this.position_ = 0;
};


/**
 * Endianness.
 * @enum {number}
 */
shaka.util.DataViewReader.Endianness = {
  BIG_ENDIAN: 0,
  LITTLE_ENDIAN: 1
};


/**
 * @return {boolean} True if the reader has more data, false otherwise.
 */
shaka.util.DataViewReader.prototype.hasMoreData = function() {
  return this.position_ < this.dataView_.byteLength;
};


/**
 * Gets the current byte position.
 * @return {number}
 */
shaka.util.DataViewReader.prototype.getPosition = function() {
  return this.position_;
};


/**
 * Gets the byte length of the DataView.
 * @return {number}
 */
shaka.util.DataViewReader.prototype.getLength = function() {
  return this.dataView_.byteLength;
};


/**
 * Reads an unsigned 8 bit integer, and advances the reader.
 * @return {number} The integer.
 * @throws {shaka.util.Error} when reading past the end of the data view.
 */
shaka.util.DataViewReader.prototype.readUint8 = function() {
  try {
    var value = this.dataView_.getUint8(this.position_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 1;
  return value;
};


/**
 * Reads an unsigned 16 bit integer, and advances the reader.
 * @return {number} The integer.
 * @throws {shaka.util.Error} when reading past the end of the data view.
 */
shaka.util.DataViewReader.prototype.readUint16 = function() {
  try {
    var value = this.dataView_.getUint16(this.position_, this.littleEndian_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 2;
  return value;
};


/**
 * Reads an unsigned 32 bit integer, and advances the reader.
 * @return {number} The integer.
 * @throws {shaka.util.Error} when reading past the end of the data view.
 */
shaka.util.DataViewReader.prototype.readUint32 = function() {
  try {
    var value = this.dataView_.getUint32(this.position_, this.littleEndian_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 4;
  return value;
};


/**
 * Reads an unsigned 64 bit integer, and advances the reader.
 * @return {number} The integer.
 * @throws {shaka.util.Error} when reading past the end of the data view or
 *   when reading an integer too large to store accurately in JavaScript.
 */
shaka.util.DataViewReader.prototype.readUint64 = function() {
  var low, high;

  try {
    if (this.littleEndian_) {
      low = this.dataView_.getUint32(this.position_, true);
      high = this.dataView_.getUint32(this.position_ + 4, true);
    } else {
      high = this.dataView_.getUint32(this.position_, false);
      low = this.dataView_.getUint32(this.position_ + 4, false);
    }
  } catch (exception) {
    this.throwOutOfBounds_();
  }

  if (high > 0x1FFFFF) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
  }

  this.position_ += 8;

  // NOTE: This is subtle, but in JavaScript you can't shift left by 32 and get
  // the full range of 53-bit values possible.  You must multiply by 2^32.
  return (high * Math.pow(2, 32)) + low;
};


/**
 * Reads the specified number of raw bytes.
 * @param {number} bytes The number of bytes to read.
 * @return {!Uint8Array}
 * @throws {shaka.util.Error} when reading past the end of the data view.
 */
shaka.util.DataViewReader.prototype.readBytes = function(bytes) {
  goog.asserts.assert(bytes > 0, 'Bad call to DataViewReader.readBytes');
  if (this.position_ + bytes > this.dataView_.byteLength) {
    this.throwOutOfBounds_();
  }
  var value = this.dataView_.buffer.slice(
      this.position_, this.position_ + bytes);
  this.position_ += bytes;
  return new Uint8Array(value);
};


/**
 * Skips the specified number of bytes.
 * @param {number} bytes The number of bytes to skip.
 * @throws {shaka.util.Error} when skipping past the end of the data view.
 */
shaka.util.DataViewReader.prototype.skip = function(bytes) {
  goog.asserts.assert(bytes >= 0, 'Bad call to DataViewReader.skip');
  if (this.position_ + bytes > this.dataView_.byteLength) {
    this.throwOutOfBounds_();
  }
  this.position_ += bytes;
};


/**
 * Keeps reading until it reaches a byte that equals to zero.  The text is
 * assumed to be UTF-8.
 * @return {string}
 * @throws {shaka.util.Error} when reading past the end of the data view.
 */
shaka.util.DataViewReader.prototype.readTerminatedString = function() {
  var start = this.position_;
  try {
    while (this.hasMoreData()) {
      var value = this.dataView_.getUint8(this.position_);
      if (value == 0) break;
      this.position_ += 1;
    }
  } catch (exception) {
    this.throwOutOfBounds_();
  }

  var ret = this.dataView_.buffer.slice(start, this.position_);
  // skip string termination
  this.position_ += 1;
  return shaka.util.StringUtils.fromUTF8(ret);
};


/**
 * @throws {shaka.util.Error}
 * @private
 */
shaka.util.DataViewReader.prototype.throwOutOfBounds_ = function() {
  throw new shaka.util.Error(
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS);
};
