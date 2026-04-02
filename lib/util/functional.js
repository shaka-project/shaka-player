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

  /**
   * Returns a Promise which is resolved after the given number of seconds.
   *
   * @param {number} seconds
   * @return {!Promise}
   */
  static delay(seconds) {
    return new Promise((resolve) => {
      new shaka.util.Timer(resolve).tickAfter(seconds);
    });
  }
};
