/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.NumberUtils');


shaka.util.NumberUtils = class {
  /**
   * Compare two float numbers, taking a configurable tolerance margin into
   * account.
   *
   * @param {number} a
   * @param {number} b
   * @param {number=} tolerance
   * @return {boolean}
   */
  static isFloatEqual(a, b, tolerance = Number.EPSILON) {
    if (a === b) {
      return true;
    }

    const error = Math.abs(a - b);

    if (error <= tolerance) {
      return true;
    }

    if (tolerance !== Number.EPSILON) {
      return Math.abs(error - tolerance) <= Number.EPSILON;
    }

    return false;
  }
};
