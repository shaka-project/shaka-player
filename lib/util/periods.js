/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Periods');


/**
 * This is a collection of period-focused utility methods.
 *
 * @final
 */
shaka.util.Periods = class {
  /**
   * Get all the variants across all periods.
   *
   * @param {!Iterable.<shaka.extern.Period>} periods
   * @return {!Array.<shaka.extern.Variant>}
   */
  static getAllVariantsFrom(periods) {
    const found = [];

    for (const period of periods) {
      for (const variant of period.variants) {
        found.push(variant);
      }
    }

    return found;
  }

  /**
   * Find our best guess at which period contains the given time. If
   * |timeInSeconds| starts before the first period, then |null| will be
   * returned.
   *
   * @param {!Iterable.<shaka.extern.Period>} periods
   * @param {number} timeInSeconds
   * @return {?shaka.extern.Period}
   */
  static findPeriodForTime(periods, timeInSeconds) {
    let bestGuess = null;

    // Go period-by-period and see if the period started before our current
    // time. If so, we could be in that period. Since periods are supposed to be
    // in order by start time, we can allow later periods to override our best
    // guess.
    for (const period of periods) {
      if (timeInSeconds >= period.startTime) {
        bestGuess = period;
      }
    }

    return bestGuess;
  }
};
