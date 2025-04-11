/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.TimeUtils');


shaka.util.TimeUtils = class {
  /**
   * Convert Ntp ntpTimeStamp to UTC Time
   *
   * @param {number} ntpTimeStamp
   * @return {number} utcTime
   */
  static convertNtp(ntpTimeStamp) {
    const start = Date.UTC(1900, 0, 1, 0, 0, 0, 0);
    return new Date(start + ntpTimeStamp).getTime();
  }
};
