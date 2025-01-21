/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Functional');

goog.require('shaka.util.Timer');

/**
 * @summary A set of functional utility functions.
 */
shaka.util.Functional = class {
  /**
   * Creates a promise chain that calls the given callback for each element in
   * the array in a catch of a promise.
   *
   * e.g.:
   * Promise.reject().catch(callback(array[0])).catch(callback(array[1]));
   *
   * @param {!Array<ELEM>} array
   * @param {function(ELEM): !Promise<RESULT>} callback
   * @return {!Promise<RESULT>}
   * @template ELEM,RESULT
   */
  static createFallbackPromiseChain(array, callback) {
    return array.reduce((promise, elem) => {
      return promise.catch(() => callback(elem));
    }, Promise.reject());
  }


  /**
   * Returns the first array concatenated to the second; used to collapse an
   * array of arrays into a single array.
   *
   * @param {!Array<T>} all
   * @param {!Array<T>} part
   * @return {!Array<T>}
   * @template T
   */
  static collapseArrays(all, part) {
    return all.concat(part);
  }

  /**
   * A no-op function that ignores its arguments.  This is used to suppress
   * unused variable errors.
   * @param {...*} args
   */
  static ignored(...args) {}


  /**
   * A no-op function.  Useful in promise chains.
   */
  static noop() {}


  /**
   * Returns if the given value is not null; useful for filtering out null
   * values.
   *
   * @param {T} value
   * @return {boolean}
   * @template T
   */
  static isNotNull(value) {
    return value != null;
  }

  /**
   * Returns a Promise which is resolved only if |asyncProcess| is resolved, and
   * only if it is resolved in less than |seconds| seconds.
   *
   * If the returned Promise is resolved, it returns the same value as
   * |asyncProcess|.
   *
   * If |asyncProcess| fails, the returned Promise is rejected.
   * If |asyncProcess| takes too long, the returned Promise is rejected, but
   * |asyncProcess| is still allowed to complete.
   *
   * @param {number} seconds
   * @param {!Promise<T>} asyncProcess
   * @return {!Promise<T>}
   * @template T
   */
  static promiseWithTimeout(seconds, asyncProcess) {
    return Promise.race([
      asyncProcess,
      new Promise(((_, reject) => {
        new shaka.util.Timer(reject).tickAfter(seconds);
      })),
    ]);
  }
};
