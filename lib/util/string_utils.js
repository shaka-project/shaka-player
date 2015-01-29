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
 * @summary A set of string utility functions.
 */


/**
 * Convert a raw string to a base-64 string.
 * @param {string} str
 * @param {boolean=} opt_padding If true, pad the output with equals signs.
 *     Defaults to true.
 * @return {string}
 */
shaka.util.StringUtils.toBase64 = function(str, opt_padding) {
  var base64 = window.btoa(str);
  var padding = (opt_padding == undefined) ? true : opt_padding;
  return padding ? base64 : base64.replace(/=*$/, '');
};


/**
 * Convert a base-64 string to a raw string.
 * @param {string} str
 * @return {string}
 */
shaka.util.StringUtils.fromBase64 = function(str) {
  return window.atob(str);
};

