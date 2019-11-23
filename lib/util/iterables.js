/** @license
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
   * @param {!Iterable.<FROM>} iterable
   * @param {function(FROM):TO} mapping
   * @return {!Iterable.<TO>}
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
   * @param {!Iterable.<T>} iterable
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
   * @param {!Iterable.<T>} iterable
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
   * @param {!Iterable.<T>} iterable
   * @param {function(T):boolean} filter
   * @return {!Array.<T>}
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

  /**
   * Returns an iterable that contains numbers in the range [0, end).
   *
   * @param {number=} end The exclusive end of the list.
   * @return {!Iterable.<number>}
   */
  static* range(end) {
    for (let i = 0; i < end; i++) {
      yield i;
    }
  }

  /**
   * Iterates over an iterable object and includes additional info about each
   * item:
   * - The zero-based index of the element.
   * - The next item in the list, if it exists.
   * - The previous item in the list, if it exists.
   *
   * @param {!Iterable.<T>} iterable
   * @return {!Iterable.<
   *     {i: number, item: T, prev: (T|undefined), next: (T|undefined)}>}
   * @template T
   */
  static* enumerate(iterable) {
    // Since we want the "next" item, we need to skip the first item and return
    // elements one in the past.  So as we iterate, we are getting the "next"
    // element and yielding the one from the previous iteration.
    let i = -1;
    let prev = undefined;
    let item = undefined;
    for (const next of iterable) {
      if (i >= 0) {
        yield {i, item, prev, next};
      }
      i++;
      prev = item;
      item = next;
    }
    if (i != -1) {
      // If it's still -1, there were no items.  Otherwise we need to yield
      // the last item.
      yield {i, prev, item, next: undefined};
    }
  }
};
