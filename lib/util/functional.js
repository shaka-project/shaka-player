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

goog.provide('shaka.util.Functional');


/**
 * @namespace shaka.util.Functional
 * @summary A set of functional utility functions.
 */


/**
 * Creates a promise chain that calls the given callback for each element in
 * the array in a catch of a promise.
 *
 * e.g.:
 * Promise.reject().catch(callback(array[0])).catch(callback(array[1]));
 *
 * @param {!Array.<ELEM>} array
 * @param {function(ELEM):!Promise.<RESULT>} callback
 * @return {!Promise.<RESULT>}
 * @template ELEM,RESULT
 */
shaka.util.Functional.createFallbackPromiseChain = function(array, callback) {
  return array.reduce(function(callback, promise, elem) {
    return promise.catch(callback.bind(null, elem));
  }.bind(null, callback), Promise.reject());
};


/**
 * Returns the first array concatenated to the second; used to collapse an
 * array of arrays into a single array.
 *
 * @param {!Array.<T>} all
 * @param {!Array.<T>} part
 * @return {!Array.<T>}
 * @template T
 */
shaka.util.Functional.collapseArrays = function(all, part) {
  return all.concat(part);
};


/**
 * A no-op function.  Useful in promise chains.
 */
shaka.util.Functional.noop = function() {};


/**
 * Returns if the given value is not null; useful for filtering out null values.
 *
 * @param {T} value
 * @return {boolean}
 * @template T
 */
shaka.util.Functional.isNotNull = function(value) {
  return value != null;
};
