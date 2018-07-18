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

goog.provide('shaka.util.Uint8ArrayUtils');

goog.require('shaka.util.StringUtils');


/**
 * @namespace shaka.util.Uint8ArrayUtils
 * @summary A set of Uint8Array utility functions.
 * @exportDoc
 */


/**
 * Convert a Uint8Array to a base64 string.  The output will always use the
 * alternate encoding/alphabet also known as "base64url".
 * @param {!Uint8Array} arr
 * @param {boolean=} padding If true, pad the output with equals signs.
 *   Defaults to true.
 * @return {string}
 * @export
 */
shaka.util.Uint8ArrayUtils.toBase64 = function(arr, padding) {
  // btoa expects a "raw string" where each character is interpreted as a byte.
  let bytes = shaka.util.StringUtils.fromCharCode(arr);
  padding = (padding == undefined) ? true : padding;
  let base64 = window.btoa(bytes).replace(/\+/g, '-').replace(/\//g, '_');
  return padding ? base64 : base64.replace(/=*$/, '');
};


/**
 * Convert a base64 string to a Uint8Array.  Accepts either the standard
 * alphabet or the alternate "base64url" alphabet.
 * @param {string} str
 * @return {!Uint8Array}
 * @export
 */
shaka.util.Uint8ArrayUtils.fromBase64 = function(str) {
  // atob creates a "raw string" where each character is interpreted as a byte.
  let bytes = window.atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  let result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; ++i) {
    result[i] = bytes.charCodeAt(i);
  }
  return result;
};


/**
 * Convert a hex string to a Uint8Array.
 * @param {string} str
 * @return {!Uint8Array}
 * @export
 */
shaka.util.Uint8ArrayUtils.fromHex = function(str) {
  let arr = new Uint8Array(str.length / 2);
  for (let i = 0; i < str.length; i += 2) {
    arr[i / 2] = window.parseInt(str.substr(i, 2), 16);
  }
  return arr;
};


/**
 * Convert a Uint8Array to a hex string.
 * @param {!Uint8Array} arr
 * @return {string}
 * @export
 */
shaka.util.Uint8ArrayUtils.toHex = function(arr) {
  let hex = '';
  for (let i = 0; i < arr.length; ++i) {
    let value = arr[i].toString(16);
    if (value.length == 1) value = '0' + value;
    hex += value;
  }
  return hex;
};


/**
 * Compare two Uint8Arrays for equality.
 * @param {Uint8Array} arr1
 * @param {Uint8Array} arr2
 * @return {boolean}
 * @export
 */
shaka.util.Uint8ArrayUtils.equal = function(arr1, arr2) {
  if (!arr1 && !arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length != arr2.length) return false;
  for (let i = 0; i < arr1.length; ++i) {
    if (arr1[i] != arr2[i]) return false;
  }
  return true;
};


/**
 * Concatenate Uint8Arrays.
 * @param {...!Uint8Array} varArgs
 * @return {!Uint8Array}
 * @export
 */
shaka.util.Uint8ArrayUtils.concat = function(...varArgs) {
  let totalLength = 0;
  for (let i = 0; i < varArgs.length; ++i) {
    totalLength += varArgs[i].length;
  }

  let result = new Uint8Array(totalLength);
  let offset = 0;
  for (let i = 0; i < varArgs.length; ++i) {
    result.set(varArgs[i], offset);
    offset += varArgs[i].length;
  }
  return result;
};
