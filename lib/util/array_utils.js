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
 * Returns whether the two values contain the same value.  This correctly
 * handles comparisons involving NaN.
 * @param {T} a
 * @param {T} b
 * @return {boolean}
 * @template T
 */
shaka.util.ArrayUtils.defaultEquals = function(a, b) {
  // NaN !== NaN, so we need to special case it.
  if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
    return true;
  }
  return a === b;
};


/**
 * Remove duplicate entries from an array.  Order N^2, so use with caution.
 * @param {!Array.<T>} array
 * @param {function(T, T): boolean=} compareFn An optional function which
 *   will be used to compare items in the array.
 * @return {!Array.<T>}
 * @template T
 */
shaka.util.ArrayUtils.removeDuplicates = function(array, compareFn) {
  if (!compareFn) {
    compareFn = shaka.util.ArrayUtils.defaultEquals;
  }

  let result = [];
  for (const item of array) {
    const idx = shaka.util.ArrayUtils.indexOf(result, item, compareFn);
    if (idx == -1) {
      result.push(item);
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
  for (let i = 0; i < array.length; ++i) {
    if (compareFn(array[i], value)) {
      return i;
    }
  }
  return -1;
};


/**
 * Remove given element from array (assumes no duplicates).
 * @param {!Array.<T>} array
 * @param {T} element
 * @template T
 */
shaka.util.ArrayUtils.remove = function(array, element) {
  let index = array.indexOf(element);
  if (index > -1) {
    array.splice(index, 1);
  }
};


/**
 * Count the number of items in the list that pass the check function.
 * @param {!Array.<T>} array
 * @param {function(T):boolean} check
 * @return {number}
 * @template T
 */
shaka.util.ArrayUtils.count = function(array, check) {
  let count = 0;

  array.forEach(function(element) {
    count += check(element) ? 1 : 0;
  });

  return count;
};
