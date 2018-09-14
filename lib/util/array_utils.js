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


/**
 * Determines if the given arrays contain the same elements.
 *
 * @param {!Array.<T>} a
 * @param {!Array.<T>} b
 * @param {function(T, T):boolean=} compareFn
 * @return {boolean}
 * @template T
 */
shaka.util.ArrayUtils.hasSameElements = function(a, b, compareFn) {
  if (!compareFn) {
    compareFn = shaka.util.ArrayUtils.defaultEquals;
  }
  if (a.length != b.length) {
    return false;
  }

  let copy = b.slice();
  for (const item of a) {
    const idx = copy.findIndex((other) => compareFn(item, other));
    if (idx == -1) {
      return false;
    }
    // Since order doesn't matter, just swap the last element with this one and
    // then drop the last element.
    copy[idx] = copy[copy.length - 1];
    copy.pop();
  }

  return copy.length == 0;
};
