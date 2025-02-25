/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.PeriodSwitchingStrategy');

/**
 * @enum {string}
 * @export
 */
shaka.config.PeriodSwitchingStrategy = {
  /**
   * Do not reset MediaSource across periods.
   */
  'NEVER': 'never',
  /**
   * Always reset MediaSource when entering a new period.
   */
  'ALWAYS': 'always',
  /**
   * Reset MediaSource when transitioning to an encrypted period,
   * from a plain period.
   */
  'PLAIN_TO_ENCRYPTED': 'plain_to_encrypted',
};
