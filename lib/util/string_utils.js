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

goog.provide('shaka.util.StringUtils');

goog.require('shaka.log');
goog.require('shaka.util.Error');


/**
 * @namespace shaka.util.StringUtils
 * @summary A set of string utility functions.
 */


/**
 * Creates a string from the given buffer as UTF-8 encoding.
 *
 * @param {?BufferSource} data
 * @return {string}
 * @throws {shaka.util.Error}
 */
shaka.util.StringUtils.fromUTF8 = function(data) {
  if (!data) return '';

  var uint8 = new Uint8Array(data);
  // If present, strip off the UTF-8 BOM.
  if (uint8[0] == 0xef && uint8[1] == 0xbb && uint8[2] == 0xbf) {
    uint8 = uint8.subarray(3);
  }

  // http://stackoverflow.com/a/13691499
  var utf8 = shaka.util.StringUtils.fromCharCode_(uint8);
  // This converts each character in the string to an escape sequence.  If the
  // character is in the ASCII range, it is not converted; otherwise it is
  // converted to a URI escape sequence.
  // Example: '\x67\x35\xe3\x82\xac' -> 'g#%E3%82%AC'
  var escaped = escape(utf8);
  // Decode the escaped sequence.  This will interpret UTF-8 sequences into the
  // correct character.
  // Example: 'g#%E3%82%AC' -> 'g#€'
  try {
    return decodeURIComponent(escaped);
  } catch (e) {
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT, shaka.util.Error.Code.BAD_ENCODING);
  }
};


/**
 * Creates a string from the given buffer as UTF-16 encoding.
 *
 * @param {?BufferSource} data
 * @param {boolean} littleEndian true to read little endian, false to read big.
 * @return {string}
 * @throws {shaka.util.Error}
 */
shaka.util.StringUtils.fromUTF16 = function(data, littleEndian) {
  if (!data) return '';

  if (data.byteLength % 2 != 0) {
    shaka.log.error('Data has an incorrect length, must be even.');
    throw new shaka.util.Error(
        shaka.util.Error.Category.TEXT, shaka.util.Error.Code.BAD_ENCODING);
  }

  /** @type {ArrayBuffer} */
  var buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else {
    // Have to create a new buffer because the argument may be a smaller
    // view on a larger ArrayBuffer.  We cannot use an ArrayBufferView in
    // a DataView.
    var temp = new Uint8Array(data.byteLength);
    temp.set(new Uint8Array(data));
    buffer = temp.buffer;
  }

  // Use a DataView to ensure correct endianness.
  var length = data.byteLength / 2;
  var arr = new Uint16Array(length);
  var dataView = new DataView(buffer);
  for (var i = 0; i < length; i++) {
    arr[i] = dataView.getUint16(i * 2, littleEndian);
  }
  return shaka.util.StringUtils.fromCharCode_(arr);
};


/**
 * Creates a string from the given buffer, auto-detecting the encoding that is
 * being used.  If it cannot detect the encoding, it will throw an exception.
 *
 * @param {?BufferSource} data
 * @return {string}
 * @throws {shaka.util.Error}
 */
shaka.util.StringUtils.fromBytesAutoDetect = function(data) {
  var StringUtils = shaka.util.StringUtils;

  var uint8 = new Uint8Array(data);
  if (uint8[0] == 0xef && uint8[1] == 0xbb && uint8[2] == 0xbf)
    return StringUtils.fromUTF8(uint8);
  else if (uint8[0] == 0xfe && uint8[1] == 0xff)
    return StringUtils.fromUTF16(uint8.subarray(2), false /* littleEndian */);
  else if (uint8[0] == 0xff && uint8[1] == 0xfe)
    return StringUtils.fromUTF16(uint8.subarray(2), true /* littleEndian */);

  var isAscii = (function(arr, i) {
    // arr[i] >= ' ' && arr[i] <= '~';
    return arr.byteLength <= i || (arr[i] >= 0x20 && arr[i] <= 0x7e);
  }.bind(null, uint8));

  shaka.log.debug('Unable to find byte-order-mark, making an educated guess.');
  if (uint8[0] == 0 && uint8[2] == 0)
    return StringUtils.fromUTF16(data, false /* littleEndian */);
  else if (uint8[1] == 0 && uint8[3] == 0)
    return StringUtils.fromUTF16(data, true /* littleEndian */);
  else if (isAscii(0) && isAscii(1) && isAscii(2) && isAscii(3))
    return StringUtils.fromUTF8(data);

  throw new shaka.util.Error(
      shaka.util.Error.Category.TEXT,
      shaka.util.Error.Code.UNABLE_TO_DETECT_ENCODING);
};


/**
 * Creates a ArrayBuffer from the given string, converting to UTF-8 encoding.
 *
 * @param {string} str
 * @return {!ArrayBuffer}
 */
shaka.util.StringUtils.toUTF8 = function(str) {
  // http://stackoverflow.com/a/13691499
  // Converts the given string to a URI encoded string.  If a character falls
  // in the ASCII range, it is not converted; otherwise it will be converted to
  // a series of URI escape sequences according to UTF-8.
  // Example: 'g#€' -> 'g#%E3%82%AC'
  var encoded = encodeURIComponent(str);
  // Convert each escape sequence individually into a character.  Each escape
  // sequence is interpreted as a code-point, so if an escape sequence happens
  // to be part of a multi-byte sequence, each byte will be converted to a
  // single character.
  // Example: 'g#%E3%82%AC' -> '\x67\x35\xe3\x82\xac'
  var utf8 = unescape(encoded);

  var result = new Uint8Array(utf8.length);
  for (var i = 0; i < utf8.length; ++i) {
    result[i] = utf8.charCodeAt(i);
  }
  return result.buffer;
};


/**
 * Creates a new string from the given array of char codes.
 *
 * @param {!ITypedArray} args
 * @return {string}
 * @private
 */
shaka.util.StringUtils.fromCharCode_ = function(args) {
  var max = 16000;
  var ret = '';
  for (var i = 0; i < args.length; i += max) {
    var subArray = args.subarray(i, i + max);
    ret += String.fromCharCode.apply(null, subArray);
  }

  return ret;
};
