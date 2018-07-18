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

goog.provide('shaka.util.EbmlElement');
goog.provide('shaka.util.EbmlParser');

goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * Creates an Extensible Binary Markup Language (EBML) parser.
 * @param {!DataView} dataView The EBML data.
 * @constructor
 * @struct
 */
shaka.util.EbmlParser = function(dataView) {
  /** @private {!DataView} */
  this.dataView_ = dataView;

  /** @private {!shaka.util.DataViewReader} */
  this.reader_ = new shaka.util.DataViewReader(
      dataView,
      shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

  // If not already constructed, build a list of EBML dynamic size constants.
  // This is not done at load-time to avoid exceptions on unsupported browsers.
  if (!shaka.util.EbmlParser.DYNAMIC_SIZES) {
    shaka.util.EbmlParser.DYNAMIC_SIZES = [
      new Uint8Array([0xff]),
      new Uint8Array([0x7f, 0xff]),
      new Uint8Array([0x3f, 0xff, 0xff]),
      new Uint8Array([0x1f, 0xff, 0xff, 0xff]),
      new Uint8Array([0x0f, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x07, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    ];
  }
};


/** @const {!Array.<!Uint8Array>} */
shaka.util.EbmlParser.DYNAMIC_SIZES;


/**
 * @return {boolean} True if the parser has more data, false otherwise.
 */
shaka.util.EbmlParser.prototype.hasMoreData = function() {
  return this.reader_.hasMoreData();
};


/**
 * Parses an EBML element from the parser's current position, and advances
 * the parser.
 * @return {!shaka.util.EbmlElement} The EBML element.
 * @throws {shaka.util.Error}
 * @see http://matroska.org/technical/specs/rfc/index.html
 */
shaka.util.EbmlParser.prototype.parseElement = function() {
  let id = this.parseId_();

  // Parse the element's size.
  let vint = this.parseVint_();
  let size;
  if (shaka.util.EbmlParser.isDynamicSizeValue_(vint)) {
    // If this has an unknown size, assume that it takes up the rest of the
    // data.
    size = this.dataView_.byteLength - this.reader_.getPosition();
  } else {
    size = shaka.util.EbmlParser.getVintValue_(vint);
  }

  // Note that if the element's size is larger than the buffer then we are
  // parsing a "partial element". This may occur if for example we are
  // parsing the beginning of some WebM container data, but our buffer does
  // not contain the entire WebM container data.
  let elementSize =
      this.reader_.getPosition() + size <= this.dataView_.byteLength ?
      size :
      this.dataView_.byteLength - this.reader_.getPosition();

  let dataView = new DataView(
      this.dataView_.buffer,
      this.dataView_.byteOffset + this.reader_.getPosition(), elementSize);

  this.reader_.skip(elementSize);

  return new shaka.util.EbmlElement(id, dataView);
};


/**
 * Parses an EBML ID from the parser's current position, and advances the
 * parser.
 * @throws {shaka.util.Error}
 * @return {number} The EBML ID.
 * @private
 */
shaka.util.EbmlParser.prototype.parseId_ = function() {
  let vint = this.parseVint_();

  if (vint.length > 7) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_OVERFLOW);
  }

  let id = 0;
  for (let i = 0; i < vint.length; i++) {
    // Note that we cannot use << since |value| may exceed 32 bits.
    id = (256 * id) + vint[i];
  }

  return id;
};


/**
 * Parses a variable sized integer from the parser's current position, and
 * advances the parser.
 * For example:
 *   1 byte  wide: 1xxx xxxx
 *   2 bytes wide: 01xx xxxx xxxx xxxx
 *   3 bytes wide: 001x xxxx xxxx xxxx xxxx xxxx
 * @throws {shaka.util.Error}
 * @return {!Uint8Array} The variable sized integer.
 * @private
 */
shaka.util.EbmlParser.prototype.parseVint_ = function() {
  let firstByte = this.reader_.readUint8();
  let numBytes;

  // Determine the byte width of the variable sized integer.
  for (numBytes = 1; numBytes <= 8; numBytes++) {
    let mask = 0x1 << (8 - numBytes);
    if (firstByte & mask) {
      break;
    }
  }

  if (numBytes > 8) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_OVERFLOW);
  }

  let vint = new Uint8Array(numBytes);
  vint[0] = firstByte;

  // Include the remaining bytes.
  for (let i = 1; i < numBytes; i++) {
    vint[i] = this.reader_.readUint8();
  }

  return vint;
};


/**
 * Gets the value of a variable sized integer.
 * For example, the x's below are part of the vint's value.
 *    7-bit value: 1xxx xxxx
 *   14-bit value: 01xx xxxx xxxx xxxx
 *   21-bit value: 001x xxxx xxxx xxxx xxxx xxxx
 * @param {!Uint8Array} vint The variable sized integer.
 * @throws {shaka.util.Error}
 * @return {number} The value of the variable sized integer.
 * @private
 */
shaka.util.EbmlParser.getVintValue_ = function(vint) {
  // If |vint| is 8 bytes wide then we must ensure that it does not have more
  // than 53 meaningful bits. For example, assume |vint| is 8 bytes wide,
  // so it has the following structure,
  // 0000 0001 | xxxx xxxx ...
  // Thus, the first 3 bits following the first byte of |vint| must be 0.
  if ((vint.length == 8) && (vint[1] & 0xe0)) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
  }

  // Mask out the first few bits of |vint|'s first byte to get the most
  // significant bits of |vint|'s value. If |vint| is 8 bytes wide then |value|
  // will be set to 0.
  let mask = 0x1 << (8 - vint.length);
  let value = vint[0] & (mask - 1);

  // Add the remaining bytes.
  for (let i = 1; i < vint.length; i++) {
    // Note that we cannot use << since |value| may exceed 32 bits.
    value = (256 * value) + vint[i];
  }

  return value;
};


/**
 * Checks if the given variable sized integer represents a dynamic size value.
 * @param {!Uint8Array} vint The variable sized integer.
 * @return {boolean} true if |vint| represents a dynamic size value,
 *   false otherwise.
 * @private
 */
shaka.util.EbmlParser.isDynamicSizeValue_ = function(vint) {
  const EbmlParser = shaka.util.EbmlParser;
  let uint8ArrayEqual = shaka.util.Uint8ArrayUtils.equal;

  for (let i = 0; i < EbmlParser.DYNAMIC_SIZES.length; i++) {
    if (uint8ArrayEqual(vint, EbmlParser.DYNAMIC_SIZES[i])) {
      return true;
    }
  }

  return false;
};


/**
 * Creates an EbmlElement.
 * @param {number} id The ID.
 * @param {!DataView} dataView The DataView.
 * @constructor
 */
shaka.util.EbmlElement = function(id, dataView) {
  /** @type {number} */
  this.id = id;

  /** @private {!DataView} */
  this.dataView_ = dataView;
};


/**
 * Gets the element's offset from the beginning of the buffer.
 * @return {number}
 */
shaka.util.EbmlElement.prototype.getOffset = function() {
  return this.dataView_.byteOffset;
};


/**
 * Interpret the element's data as a list of sub-elements.
 * @throws {shaka.util.Error}
 * @return {!shaka.util.EbmlParser} A parser over the sub-elements.
 */
shaka.util.EbmlElement.prototype.createParser = function() {
  return new shaka.util.EbmlParser(this.dataView_);
};


/**
 * Interpret the element's data as an unsigned integer.
 * @throws {shaka.util.Error}
 * @return {number}
 */
shaka.util.EbmlElement.prototype.getUint = function() {
  if (this.dataView_.byteLength > 8) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_OVERFLOW);
  }

  // Ensure we have at most 53 meaningful bits.
  if ((this.dataView_.byteLength == 8) && (this.dataView_.getUint8(0) & 0xe0)) {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
  }

  let value = 0;

  for (let i = 0; i < this.dataView_.byteLength; i++) {
    let chunk = this.dataView_.getUint8(i);
    value = (256 * value) + chunk;
  }

  return value;
};


/**
 * Interpret the element's data as a floating point number (32 bits or 64 bits).
 * 80-bit floating point numbers are not supported.
 * @throws {shaka.util.Error}
 * @return {number}
 */
shaka.util.EbmlElement.prototype.getFloat = function() {
  if (this.dataView_.byteLength == 4) {
    return this.dataView_.getFloat32(0);
  } else if (this.dataView_.byteLength == 8) {
    return this.dataView_.getFloat64(0);
  } else {
    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.EBML_BAD_FLOATING_POINT_SIZE);
  }
};

