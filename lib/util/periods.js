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
