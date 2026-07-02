/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isCmcdCustomKey');

goog.require('cml.cmcd.CmcdKey');


/** @private @const {!RegExp} */
cml.cmcd.isCmcdCustomKey_REGEX_ = /^[a-zA-Z0-9-.]+-[a-zA-Z0-9-.]+$/;


/**
 * Check if a key is a custom key.
 *
 * @param {cml.cmcd.CmcdKey} key The key to check.
 * @return {boolean} `true` if the key is a custom key, `false`
 *   otherwise.
 */
cml.cmcd.isCmcdCustomKey = function(key) {
  return cml.cmcd.isCmcdCustomKey_REGEX_.test(key);
};
