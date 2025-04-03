/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.CrossBoundaryStrategy');

/**
 * @enum {string}
 * @export
 */
shaka.config.CrossBoundaryStrategy = {
  /**
   * Never reset MediaSource when crossing boundary.
   */
  'KEEP': 'keep',
  /**
   * Always reset MediaSource when crossing boundary.
   */
  'RESET': 'reset',
  /**
   * Reset MediaSource, when transitioning from a plain
   * boundary to an encrypted boundary or from an encrypted
   * boundary to a plain boundary.
   */
  'RESET_ON_ENCRYPTION_CHANGE': 'RESET_ON_ENCRYPTION_CHANGE',
};
