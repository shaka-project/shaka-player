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

goog.provide('shaka.util.DataViewWriter');

goog.require('shaka.util.Error');



/**
 * Creates a DataViewWriter, which abstracts a DataView object.
 *
 * @param {!DataView} dataView The DataView.
 * @param {shaka.util.DataViewWriter.Endianness} endianness The endianness.
 *
 * @struct
 * @constructor
 * @export
 */
shaka.util.DataViewWriter = function(dataView, endianness) {
  /** @private {!DataView} */
  this.dataView_ = dataView;

  /** @private {!Uint8Array} */
  this.byteArray_ = new Uint8Array(dataView.buffer);

  /** @private {boolean} */
  this.littleEndian_ =
      endianness == shaka.util.DataViewWriter.Endianness.LITTLE_ENDIAN;

  /** @private {number} */
  this.position_ = 0;
};


/**
 * Endianness.
 * @enum {number}
 * @export
 */
shaka.util.DataViewWriter.Endianness = {
  BIG_ENDIAN: 0,
  LITTLE_ENDIAN: 1
};


/**
 * @return {boolean} True if the writer has more data, false otherwise.
 * @export
 */
shaka.util.DataViewWriter.prototype.hasMoreData = function() {
  return this.position_ < this.dataView_.byteLength;
};


/**
 * Gets the current byte position.
 * @return {number}
 * @export
 */
shaka.util.DataViewWriter.prototype.getPosition = function() {
  return this.position_;
};


/**
 * Gets the byte length of the DataView.
 * @return {number}
 * @export
 */
shaka.util.DataViewWriter.prototype.getLength = function() {
  return this.dataView_.byteLength;
};

/**
 * Gets the byte length of the DataView.
 * @return {!Uint8Array}
 * @export
 */
shaka.util.DataViewWriter.prototype.getArray = function() {
  return this.byteArray_;
};


/**
 * Writes an unsigned 8 bit integer, and advances the writer.
 * @param {number} value The integer.
 * @throws {shaka.util.Error} when writing past the end of the data view.
 * @export
 */
shaka.util.DataViewWriter.prototype.writeUint8 = function(value) {
  try {
    this.dataView_.setUint8(this.position_, value);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 1;
};


/**
 * Writes an unsigned 16 bit integer, and advances the writer.
 * @param {number} value The integer.
 * @throws {shaka.util.Error} when writing past the end of the data view.
 * @export
 */
shaka.util.DataViewWriter.prototype.writeUint16 = function(value) {
  try {
    this.dataView_.setUint16(this.position_, value, this.littleEndian_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 2;
};


/**
 * Writes an unsigned 32 bit integer, and advances the writer.
 * @param {number} value The integer.
 * @throws {shaka.util.Error} when writing past the end of the data view.
 * @export
 */
shaka.util.DataViewWriter.prototype.writeUint32 = function(value) {
  try {
    this.dataView_.setUint32(this.position_, value, this.littleEndian_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += 4;
};

/**
 * Writes an unsigned 32 bit integer, and advances the writer.
 * @param {Uint8Array} array The integer.
 * @throws {shaka.util.Error} when writing past the end of the data view.
 * @export
 */
shaka.util.DataViewWriter.prototype.put = function(array) {
  try {
    this.byteArray_.set(array, this.position_);
  } catch (exception) {
    this.throwOutOfBounds_();
  }
  this.position_ += array.length;
};


/**
 * @throws {shaka.util.Error}
 * @private
 */
shaka.util.DataViewWriter.prototype.throwOutOfBounds_ = function() {
  throw new shaka.util.Error(
      shaka.util.Error.Severity.CRITICAL,
      shaka.util.Error.Category.MEDIA,
      shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS);
};
