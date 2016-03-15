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

goog.provide('shaka.util.ArrayUtils');


/**
 * @namespace shaka.util.ArrayUtils
 * @summary Array utility functions.
 */


/**
 * Remove duplicate entries from an array.  Order N^2, so use with caution.
 * @param {!Array.<T>} array
 * @param {function(T, T): boolean=} opt_compareFn An optional function which
 *   will be used to compare items in the array.
 * @return {!Array.<T>}
 * @template T
 */
shaka.util.ArrayUtils.removeDuplicates = function(array, opt_compareFn) {
  var result = [];
  for (var i = 0; i < array.length; ++i) {
    var matchFound = false;
    for (var j = 0; j < result.length; ++j) {
      matchFound = opt_compareFn ? opt_compareFn(array[i], result[j]) :
                                   array[i] === result[j];
      if (matchFound) break;
    }
    if (!matchFound) {
      result.push(array[i]);
    }
  }
  return result;
};


/**
 * Find an item in an array.  For use when comparison of entries via == will
 * not suffice.
 * @param {!Array.<T>} array
 * @param {T} value
 * @param {function(T, T): boolean} compareFn A function which will be used to
 *   compare items in the array.
 * @return {number} The index, or -1 if not found.
 * @template T
 */
shaka.util.ArrayUtils.indexOf = function(array, value, compareFn) {
  for (var i = 0; i < array.length; ++i) {
    if (compareFn(array[i], value)) {
      return i;
    }
  }
  return -1;
};

