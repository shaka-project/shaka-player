/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.CodecSwitchingStrategy');

/**
 * @enum {number}
 * @export
 */
shaka.config.CodecSwitchingStrategy = {
  'DISABLED': 0,
  'RELOAD': 1,
  'SMOOTH': 2,
};
