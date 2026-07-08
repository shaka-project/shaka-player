/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isCmcdV1Key');

goog.require('cml.cmcd.CMCD_V1_KEYS');
goog.require('cml.cmcd.isCmcdCustomKey');


/** @private @const {!Set<string>} */
cml.cmcd.isCmcdV1Key_SET_ = new Set(cml.cmcd.CMCD_V1_KEYS);


/**
 * Filter function for CMCD v1 keys.
 *
 * @param {string} key The CMCD key to filter.
 * @return {boolean} `true` if the key should be included, `false`
 *   otherwise.
 */
cml.cmcd.isCmcdV1Key = function(key) {
  return cml.cmcd.isCmcdV1Key_SET_.has(key) || cml.cmcd.isCmcdCustomKey(key);
};
