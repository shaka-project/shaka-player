/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Iterables');


/**
 * Recreations of Array-like functions so that they work on any iterable
 * type.
 * @final
 */
shaka.util.Iterables = class {
  /**
   * @param {!Iterable<FROM>} iterable
   * @param {function(FROM):TO} mapping
   * @return {!Iterable<TO>}
   * @template FROM,TO
   */
  static map(iterable, mapping) {
    const array = [];
    for (const x of iterable) {
      array.push(mapping(x));
    }
    return array;
  }

  /**
   * @param {!Iterable<T>} iterable
   * @param {function(T):boolean} test
   * @return {boolean}
   * @template T
   */
  static every(iterable, test) {
    for (const x of iterable) {
      if (!test(x)) {
        return false;
      }
    }
    return true;
  }

  /**
   * @param {!Iterable<T>} iterable
   * @param {function(T):boolean} test
   * @return {boolean}
   * @template T
   */
  static some(iterable, test) {
    for (const x of iterable) {
      if (test(x)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Iterate over an iterable object and return only the items that |filter|
   * returns true for.
   *
   * @param {!Iterable<T>} iterable
   * @param {function(T):boolean} filter
   * @return {!Array<T>}
   * @template T
   */
  static filter(iterable, filter) {
    const out = [];
    for (const x of iterable) {
      if (filter(x)) {
        out.push(x);
      }
    }
    return out;
  }
};
