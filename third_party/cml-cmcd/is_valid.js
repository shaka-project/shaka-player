/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.isValid');


/**
 * Checks if the given value is valid.
 *
 * @param {*} value The value to check.
 * @return {boolean} `true` if the value is valid.
 */
cml.cmcd.isValid = function(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return value != null && value !== '' && value !== false;
};
