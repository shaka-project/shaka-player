/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.EbmlElement');
goog.provide('shaka.util.EbmlParser');

goog.require('goog.asserts');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.Error');


/**
 * @summary
 * Extensible Binary Markup Language (EBML) parser.
 */
shaka.util.EbmlParser = class {
  /**
   * @param {BufferSource} data
   */
  constructor(data) {
    /** @private {!DataView} */
    this.dataView_ = shaka.util.BufferUtils.toDataView(data);

    /** @private {!shaka.util.DataViewReader} */
    this.reader_ = new shaka.util.DataViewReader(
        this.dataView_, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
  }


  /**
   * @return {boolean} True if the parser has more data, false otherwise.
   */
  hasMoreData() {
    return this.reader_.hasMoreData();
  }


  /**
   * Parses an EBML element from the parser's current position, and advances
   * the parser.
   * @return {!shaka.util.EbmlElement} The EBML element.
   * @see http://matroska.org/technical/specs/rfc/index.html
   */
  parseElement() {
    const id = this.parseId_();

    // Parse the element's size.
    const vint = this.parseVint_();
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
    const elementSize =
        this.reader_.getPosition() + size <= this.dataView_.byteLength ?
        size :
        this.dataView_.byteLength - this.reader_.getPosition();

    const dataView = shaka.util.BufferUtils.toDataView(
        this.dataView_, this.reader_.getPosition(), elementSize);

    this.reader_.skip(elementSize);

    return new shaka.util.EbmlElement(id, dataView);
  }


  /**
   * Parses an EBML ID from the parser's current position, and advances the
   * parser.
   * @return {number} The EBML ID.
   * @private
   */
  parseId_() {
    const vint = this.parseVint_();

    if (vint.length > 7) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.EBML_OVERFLOW);
    }

    let id = 0;
    for (const /* byte */ b of vint) {
      // Note that we cannot use << since |value| may exceed 32 bits.
      id = (256 * id) + b;
    }

    return id;
  }


  /**
   * Parses a variable sized integer from the parser's current position, and
   * advances the parser.
   * For example:
   *   1 byte  wide: 1xxx xxxx
   *   2 bytes wide: 01xx xxxx xxxx xxxx
   *   3 bytes wide: 001x xxxx xxxx xxxx xxxx xxxx
   * @return {!Uint8Array} The variable sized integer.
   * @private
   */
  parseVint_() {
    const position = this.reader_.getPosition();
    const firstByte = this.reader_.readUint8();
    if (firstByte == 0) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.EBML_OVERFLOW);
    }

    // Determine the index of the highest bit set.
    const index = Math.floor(Math.log2(firstByte));
    const numBytes = 8 - index;
    goog.asserts.assert(numBytes <= 8 && numBytes >= 1, 'Incorrect log2 value');
    this.reader_.skip(numBytes - 1);
    return shaka.util.BufferUtils.toUint8(this.dataView_, position, numBytes);
  }


  /**
   * Gets the value of a variable sized integer.
   * For example, the x's below are part of the vint's value.
   *    7-bit value: 1xxx xxxx
   *   14-bit value: 01xx xxxx xxxx xxxx
   *   21-bit value: 001x xxxx xxxx xxxx xxxx xxxx
   * @param {!Uint8Array} vint The variable sized integer.
   * @return {number} The value of the variable sized integer.
   * @private
   */
  static getVintValue_(vint) {
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

    let value = 0;
    for (let i = 0; i < vint.length; i++) {
      const item = vint[i];
      if (i == 0) {
        // Mask out the first few bits of |vint|'s first byte to get the most
        // significant bits of |vint|'s value. If |vint| is 8 bytes wide then
        // |value| will be set to 0.
        const mask = 0x1 << (8 - vint.length);
        value = item & (mask - 1);
      } else {
        // Note that we cannot use << since |value| may exceed 32 bits.
        value = (256 * value) + item;
      }
    }

    return value;
  }


  /**
   * Checks if the given variable sized integer represents a dynamic size value.
   * @param {!Uint8Array} vint The variable sized integer.
   * @return {boolean} true if |vint| represents a dynamic size value,
   *   false otherwise.
   * @private
   */
  static isDynamicSizeValue_(vint) {
    const EbmlParser = shaka.util.EbmlParser;
    const BufferUtils = shaka.util.BufferUtils;

    for (const dynamicSizeConst of EbmlParser.DYNAMIC_SIZES) {
      if (BufferUtils.equal(vint, new Uint8Array(dynamicSizeConst))) {
        return true;
      }
    }

    return false;
  }
};


/**
 * A list of EBML dynamic size constants.
 * @const {!Array.<!Array.<number>>}
 */
shaka.util.EbmlParser.DYNAMIC_SIZES = [
  [0xff],
  [0x7f, 0xff],
  [0x3f, 0xff, 0xff],
  [0x1f, 0xff, 0xff, 0xff],
  [0x0f, 0xff, 0xff, 0xff, 0xff],
  [0x07, 0xff, 0xff, 0xff, 0xff, 0xff],
  [0x03, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
  [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
];


shaka.util.EbmlElement = class {
  /**
   * @param {number} id The ID.
   * @param {!DataView} dataView The DataView.
   */
  constructor(id, dataView) {
    /** @type {number} */
    this.id = id;

    /** @private {!DataView} */
    this.dataView_ = dataView;
  }


  /**
   * Gets the element's offset from the beginning of the buffer.
   * @return {number}
   */
  getOffset() {
    return this.dataView_.byteOffset;
  }


  /**
   * Interpret the element's data as a list of sub-elements.
   * @return {!shaka.util.EbmlParser} A parser over the sub-elements.
   */
  createParser() {
    return new shaka.util.EbmlParser(this.dataView_);
  }


  /**
   * Interpret the element's data as an unsigned integer.
   * @return {number}
   */
  getUint() {
    if (this.dataView_.byteLength > 8) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.EBML_OVERFLOW);
    }

    // Ensure we have at most 53 meaningful bits.
    if ((this.dataView_.byteLength == 8) &&
        (this.dataView_.getUint8(0) & 0xe0)) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.JS_INTEGER_OVERFLOW);
    }

    let value = 0;

    for (let i = 0; i < this.dataView_.byteLength; i++) {
      const chunk = this.dataView_.getUint8(i);
      value = (256 * value) + chunk;
    }

    return value;
  }


  /**
   * Interpret the element's data as a floating point number
   * (32 bits or 64 bits). 80-bit floating point numbers are not supported.
   * @return {number}
   */
  getFloat() {
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
  }
};


