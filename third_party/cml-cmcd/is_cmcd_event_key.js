/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isCmcdEventKey');

goog.require('cml.cmcd.CMCD_EVENT_KEYS');
goog.require('cml.cmcd.isCmcdRequestKey');
goog.require('cml.cmcd.isCmcdResponseReceivedKey');


/** @private @const {!Set<string>} */
cml.cmcd.isCmcdEventKey_SET_ = new Set(cml.cmcd.CMCD_EVENT_KEYS);


/**
 * Check if a key is a valid CMCD event key.
 *
 * @param {string} key The key to check.
 * @return {boolean} `true` if the key is a valid CMCD event key,
 *   `false` otherwise.
 */
cml.cmcd.isCmcdEventKey = function(key) {
  return cml.cmcd.isCmcdRequestKey(key) ||
      cml.cmcd.isCmcdResponseReceivedKey(key) ||
      cml.cmcd.isCmcdEventKey_SET_.has(key);
};
