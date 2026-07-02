/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isCmcdRequestKey');

goog.require('cml.cmcd.CMCD_REQUEST_KEYS');
goog.require('cml.cmcd.isCmcdCustomKey');


/** @private @const {!Set<string>} */
cml.cmcd.isCmcdRequestKey_SET_ = new Set(cml.cmcd.CMCD_REQUEST_KEYS);


/**
 * Check if a key is a valid CMCD request key.
 *
 * @param {string} key The key to check.
 * @return {boolean} `true` if the key is a valid CMCD request key,
 *   `false` otherwise.
 */
cml.cmcd.isCmcdRequestKey = function(key) {
  return cml.cmcd.isCmcdRequestKey_SET_.has(key) ||
      cml.cmcd.isCmcdCustomKey(key);
};
