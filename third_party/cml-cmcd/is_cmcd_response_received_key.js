/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isCmcdResponseReceivedKey');

goog.require('cml.cmcd.CMCD_RESPONSE_KEYS');


/** @private @const {!Set<string>} */
cml.cmcd.isCmcdResponseReceivedKey_SET_ = new Set(cml.cmcd.CMCD_RESPONSE_KEYS);


/**
 * Check if a key is a valid CMCD response-received key.
 *
 * @param {string} key The key to check.
 * @return {boolean} `true` if the key is a valid CMCD response-received
 *   key, `false` otherwise.
 */
cml.cmcd.isCmcdResponseReceivedKey = function(key) {
  return cml.cmcd.isCmcdResponseReceivedKey_SET_.has(key);
};
