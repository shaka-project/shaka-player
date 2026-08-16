/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isTokenField');


/** @private @const {!Set<string>} */
cml.cmcd.isTokenField_FIELDS_ = new Set(['ot', 'sf', 'st', 'e', 'sta']);


/**
 * Checks if the given key is a token field.
 *
 * @param {string} key The key to check.
 * @return {boolean} `true` if the key is a token field.
 */
cml.cmcd.isTokenField = function(key) {
  return cml.cmcd.isTokenField_FIELDS_.has(key);
};
