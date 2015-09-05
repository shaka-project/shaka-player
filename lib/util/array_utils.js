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
 * @fileoverview Array utility functions.
 */

goog.provide('shaka.util.ArrayUtils');


/**
 * @namespace shaka.util.ArrayUtils
 * @summary Array utility functions.
 */


/**
 * Remove duplicate entries from an array.
 * @param {!Array.<T>} array
 * @param {function(T): (string|number)=} opt_keyFn An optional function which
 *     takes an array item and converts it into a key.  Use this if your array
 *     items cannot be used as an index into an Object.
 * @return {!Array.<T>} A sorted list of the keys.
 * @template T
 */
shaka.util.ArrayUtils.removeDuplicates = function(array, opt_keyFn) {
  var set = {};
  for (var i = 0; i < array.length; ++i) {
    var key = opt_keyFn ? opt_keyFn(array[i]) : array[i].toString();
    set[key] = array[i];
  }

  var result = [];
  for (var k in set) {
    result.push(set[k]);
  }
  return result;
};

