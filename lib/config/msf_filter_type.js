/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.config.MsfFilterType');

/**
 * @enum {number}
 * @export
 */
shaka.config.MsfFilterType = {
  'NONE': 0x0,
  'NEXT_GROUP_START': 0x1,
  'LARGEST_OBJECT': 0x2,
  'ABSOLUTE_START': 0x3,
  'ABSOLUTE_RANGE': 0x4,
};
