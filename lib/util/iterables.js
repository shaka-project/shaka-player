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

goog.provide('shaka.util.Iterables');


/**
 * Recreations of Array-like functions so that they work on any iterable
 * type.
 * @final
 */
shaka.util.Iterables = class {
  /**
   * @param {!Iterable.<FROM>} iterable
   * @param {function(FROM):TO} mapping
   * @return {!Iterable.<TO>}
   * @template FROM,TO
   */
  static map(iterable, mapping) {
    const array = [];
    for (const x of iterable) { array.push(mapping(x)); }
    return array;
  }

  /**
   * @param {!Iterable.<T>} iterable
   * @param {function(T):boolean} test
   * @return {boolean}
   * @template T
   */
  static every(iterable, test) {
    for (const x of iterable) {
      if (!test(x)) { return false; }
    }
    return true;
  }

  /**
   * @param {!Iterable.<T>} iterable
   * @param {function(T):boolean} test
   * @return {boolean}
   * @template T
   */
  static some(iterable, test) {
    for (const x of iterable) {
      if (test(x)) { return true; }
    }
    return false;
  }

  /**
   * Iterate over an iterable object and return only the items that |filter|
   * returns true for.
   *
   * @param {!Iterable.<T>} iterable
   * @param {function(T):boolean} filter
   * @return {!Array.<T>}
   * @template T
   */
  static filter(iterable, filter) {
    const out = [];
    for (const x of iterable) {
      if (filter(x)) { out.push(x); }
    }
    return out;
  }
};
