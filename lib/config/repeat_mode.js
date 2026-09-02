/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.RepeatMode');

/**
 * @enum {number}
 * @export
 */
shaka.config.RepeatMode = {
  /** When the queue is completed the media session is terminated. */
  'OFF': 0,
  /**
   * All the items in the queue will be played indefinitely, when the last item
   * is played it will play the first item again.
   */
  'ALL': 1,
  /** The current item will be played repeatedly. */
  'SINGLE': 2,
};
