/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.upConvertToV2');

goog.require('cml.cmcd.CMCD_INNER_LIST_KEYS');
goog.require('cml.cmcd.CMCD_V2');


/**
 * Up-convert V1 CMCD data to V2 format.
 *
 * - Wraps plain scalar values in arrays for inner-list keys.
 * - Wraps `nor` string in an array.
 *
 * If the data is already V2 (has `v: 2`), it is returned unchanged.
 *
 * @param {!Object<string, *>} obj
 * @return {!Object<string, *>}
 */
cml.cmcd.upConvertToV2 = function(obj) {
  if (obj['v'] === cml.cmcd.CMCD_V2) {
    return obj;
  }

  /** @type {!Object<string, *>} */
  const result = {};

  for (const [k, value] of Object.entries(obj)) {
    const key = /** @type {string} */ (k);
    if (value == null) {
      result[key] = value;
      continue;
    }

    if (cml.cmcd.CMCD_INNER_LIST_KEYS.has(key) && !Array.isArray(value)) {
      result[key] = [value];
    } else if (key === 'nor' && typeof value === 'string') {
      result[key] = [value];
    } else {
      result[key] = value;
    }
  }

  return result;
};
