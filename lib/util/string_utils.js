/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview String utility functions.
 */

goog.provide('shaka.util.StringUtils');


/**
 * @namespace shaka.util.StringUtils
 * @export
 * @summary A set of string utility functions.
 */


/**
 * Convert a string to a Uint8Array.
 *
 * @param {string} str The input string.
 * @return {!Uint8Array} The output array.
 * @export
 */
shaka.util.StringUtils.toUint8Array = function(str) {
  var result = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    result[i] = str.charCodeAt(i);
  }
  return result;
};


/**
 * Convert a Uint8Array to a string.
 *
 * @param {Uint8Array} array The input array.
 * @return {string} The output string.
 * @export
 */
shaka.util.StringUtils.fromUint8Array = function(array) {
  return String.fromCharCode.apply(null, array);
};


/**
 * Convert a raw string to a base-64 string.
 *
 * @param {string} str The raw string.
 * @param {boolean=} opt_padding If true, pad the output with equals signs.
 *     Defaults to true.
 * @return {string} The base-64 string.
 * @export
 */
shaka.util.StringUtils.toBase64 = function(str, opt_padding) {
  var base64 = window.btoa(str);
  var padding = (opt_padding == undefined) ? true : opt_padding;
  return padding ? base64 : base64.replace(/=*$/, '');
};


/**
 * Convert a base-64 string to a raw string.
 *
 * @param {string} str The base-64 string.
 * @return {string} The raw string.
 * @export
 */
shaka.util.StringUtils.fromBase64 = function(str) {
  return window.atob(str);
};


/**
 * Convert a hex string to a raw string.
 *
 * @param {string} str The hex string.
 * @return {string} The output string.
 * @export
 */
shaka.util.StringUtils.fromHex = function(str) {
  var ints = [];
  for (var i = 0; i < str.length; i += 2) {
    ints.push(window.parseInt(str.substr(i, 2), 16));
  }
  return String.fromCharCode.apply(null, ints);
};


/**
 * Compare two Uint8Arrays for equality.
 *
 * @param {Uint8Array} array1
 * @param {Uint8Array} array2
 * @return {boolean}
 * @export
 */
shaka.util.StringUtils.uint8ArrayEqual = function(array1, array2) {
  if (!array1 && !array2) return true;
  if (!array1 || !array2) return false;
  if (array1.length != array2.length) return false;
  for (var i = 0; i < array1.length; ++i) {
    if (array1[i] != array2[i]) return false;
  }
  return true;
};


/**
 * Convert a Uint8Array to a string which can be used as a key in a dictionary.
 * @param {!Uint8Array} array
 * @return {string}
 * @export
 */
shaka.util.StringUtils.uint8ArrayKey = function(array) {
  var tmp = [];
  for (var i = 0; i < array.length; ++i) {
    tmp.push(array[i]);
  }
  return tmp.join(',');
};

