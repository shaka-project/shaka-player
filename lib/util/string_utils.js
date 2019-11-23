/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.StringUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.Lazy');


/**
 * @namespace shaka.util.StringUtils
 * @summary A set of string utility functions.
 * @export
 */
shaka.util.StringUtils = class {
  /**
   * Creates a string from the given buffer as UTF-8 encoding.
   *
   * @param {?BufferSource} data
   * @return {string}
   * @export
   */
  static fromUTF8(data) {
    if (!data) {
      return '';
    }

    let uint8 = shaka.util.BufferUtils.toUint8(data);
    // If present, strip off the UTF-8 BOM.
    if (uint8[0] == 0xef && uint8[1] == 0xbb && uint8[2] == 0xbf) {
      uint8 = uint8.subarray(3);
    }

    // http://stackoverflow.com/a/13691499
    const utf8 = shaka.util.StringUtils.fromCharCode(uint8);
    // This converts each character in the string to an escape sequence.  If the
    // character is in the ASCII range, it is not converted; otherwise it is
    // converted to a URI escape sequence.
    // Example: '\x67\x35\xe3\x82\xac' -> 'g#%E3%82%AC'
    const escaped = escape(utf8);
    // Decode the escaped sequence.  This will interpret UTF-8 sequences into
    // the correct character.
    // Example: 'g#%E3%82%AC' -> 'g#€'
    try {
      return decodeURIComponent(escaped);
    } catch (e) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.BAD_ENCODING);
    }
  }


  /**
   * Creates a string from the given buffer as UTF-16 encoding.
   *
   * @param {?BufferSource} data
   * @param {boolean} littleEndian
         true to read little endian, false to read big.
   * @param {boolean=} noThrow true to avoid throwing in cases where we may
   *     expect invalid input.  If noThrow is true and the data has an odd
   *     length,it will be truncated.
   * @return {string}
   * @export
   */
  static fromUTF16(data, littleEndian, noThrow) {
    if (!data) {
      return '';
    }

    if (!noThrow && data.byteLength % 2 != 0) {
      shaka.log.error('Data has an incorrect length, must be even.');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          shaka.util.Error.Code.BAD_ENCODING);
    }

    // Use a DataView to ensure correct endianness.
    const length = Math.floor(data.byteLength / 2);
    const arr = new Uint16Array(length);
    const dataView = shaka.util.BufferUtils.toDataView(data);
    for (const i of shaka.util.Iterables.range(length)) {
      arr[i] = dataView.getUint16(i * 2, littleEndian);
    }
    return shaka.util.StringUtils.fromCharCode(arr);
  }


  /**
   * Creates a string from the given buffer, auto-detecting the encoding that is
   * being used.  If it cannot detect the encoding, it will throw an exception.
   *
   * @param {?BufferSource} data
   * @return {string}
   * @export
   */
  static fromBytesAutoDetect(data) {
    const StringUtils = shaka.util.StringUtils;
    if (!data) {
      return '';
    }

    const uint8 = shaka.util.BufferUtils.toUint8(data);
    if (uint8[0] == 0xef && uint8[1] == 0xbb && uint8[2] == 0xbf) {
      return StringUtils.fromUTF8(uint8);
    } else if (uint8[0] == 0xfe && uint8[1] == 0xff) {
      return StringUtils.fromUTF16(uint8.subarray(2), false /* littleEndian */);
    } else if (uint8[0] == 0xff && uint8[1] == 0xfe) {
      return StringUtils.fromUTF16(uint8.subarray(2), true /* littleEndian */);
    }

    const isAscii = (i) => {
      // arr[i] >= ' ' && arr[i] <= '~';
      return uint8.byteLength <= i || (uint8[i] >= 0x20 && uint8[i] <= 0x7e);
    };

    shaka.log.debug(
        'Unable to find byte-order-mark, making an educated guess.');
    if (uint8[0] == 0 && uint8[2] == 0) {
      return StringUtils.fromUTF16(data, false /* littleEndian */);
    } else if (uint8[1] == 0 && uint8[3] == 0) {
      return StringUtils.fromUTF16(data, true /* littleEndian */);
    } else if (isAscii(0) && isAscii(1) && isAscii(2) && isAscii(3)) {
      return StringUtils.fromUTF8(data);
    }

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.UNABLE_TO_DETECT_ENCODING);
  }


  /**
   * Creates a ArrayBuffer from the given string, converting to UTF-8 encoding.
   *
   * @param {string} str
   * @return {!ArrayBuffer}
   * @export
   */
  static toUTF8(str) {
    // http://stackoverflow.com/a/13691499
    // Converts the given string to a URI encoded string.  If a character falls
    // in the ASCII range, it is not converted; otherwise it will be converted
    // to a series of URI escape sequences according to UTF-8.
    // Example: 'g#€' -> 'g#%E3%82%AC'
    const encoded = encodeURIComponent(str);
    // Convert each escape sequence individually into a character.  Each escape
    // sequence is interpreted as a code-point, so if an escape sequence happens
    // to be part of a multi-byte sequence, each byte will be converted to a
    // single character.
    // Example: 'g#%E3%82%AC' -> '\x67\x35\xe3\x82\xac'
    const utf8 = unescape(encoded);

    const result = new Uint8Array(utf8.length);
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item} of enumerate(utf8)) {
      result[i] = item.charCodeAt(0);
    }
    return shaka.util.BufferUtils.toArrayBuffer(result);
  }


  /**
   * Creates a ArrayBuffer from the given string, converting to UTF-16 encoding.
   *
   * @param {string} str
   * @param {boolean} littleEndian
   * @return {!ArrayBuffer}
   * @export
   */
  static toUTF16(str, littleEndian) {
    const result = new ArrayBuffer(str.length * 2);
    const view = new DataView(result);
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item} of enumerate(str)) {
      const value = item.charCodeAt(0);
      view.setUint16(/* position= */ i * 2, value, littleEndian);
    }
    return result;
  }


  /**
   * Creates a new string from the given array of char codes.
   *
   * Using String.fromCharCode.apply is risky because you can trigger stack
   * errors on very large arrays.  This breaks up the array into several pieces
   * to avoid this.
   *
   * @param {!TypedArray} array
   * @return {string}
   */
  static fromCharCode(array) {
    return shaka.util.StringUtils.fromCharCodeImpl_.value()(array);
  }
};


/** @private {!shaka.util.Lazy.<function(!TypedArray):string>} */
shaka.util.StringUtils.fromCharCodeImpl_ = new shaka.util.Lazy(() => {
  /** @param {number} size @return {boolean} */
  const supportsChunkSize = (size) => {
    try {
      const buffer = new Uint8Array(size);
      // The compiler will complain about suspicious value if this isn't
      // stored in a variable and used.
      const foo = String.fromCharCode(...buffer);
      goog.asserts.assert(foo, 'Should get value');
      return true;
    } catch (error) {
      return false;
    }
  };

  // Different browsers support different chunk sizes; find out the largest
  // this browser supports so we can use larger chunks on supported browsers
  // but still support lower-end devices that require small chunks.
  // 64k is supported on all major desktop browsers.
  for (let size = 64 * 1024; size > 0; size /= 2) {
    if (supportsChunkSize(size)) {
      return (buffer) => {
        let ret = '';
        for (let i = 0; i < buffer.length; i += size) {
          const subArray = buffer.subarray(i, i + size);
          ret += String.fromCharCode(...subArray);
        }
        return ret;
      };
    }
  }
  goog.asserts.assert(false, 'Unable to create a fromCharCode method');
  return null;
});
