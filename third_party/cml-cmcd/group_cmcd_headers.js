/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.groupCmcdHeaders');

goog.require('cml.cmcd.CMCD_HEADER_MAP');
goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdHeaderField');
goog.require('cml.cmcd.CmcdHeaderMap');


/**
 * @param {!cml.cmcd.CmcdHeaderMap} headerMap
 * @return {!Object<string, string>}
 * @private
 */
cml.cmcd.groupCmcdHeaders_createHeaderMap_ = function(headerMap) {
  return Object.keys(headerMap)
      .reduce((acc, field) => {
        const keys = headerMap[field];
        if (keys) {
          keys.forEach((key) => acc[key] = field);
        }
        return acc;
      }, /** @type {!Object<string, string>} */ ({}));
};


/**
 * Group a CMCD data object into header shards.
 *
 * @param {cml.cmcd.Cmcd} cmcd The CMCD data object to convert.
 * @param {cml.cmcd.CmcdHeaderMap=} customHeaderMap A map of CMCD header
 *   fields to custom CMCD keys.
 * @return {!Object<string, !Object<string, *>>} The CMCD header shards.
 */
cml.cmcd.groupCmcdHeaders = function(cmcd, customHeaderMap) {
  /** @type {!Object<string, !Object<string, *>>} */
  const result = {};

  if (!cmcd) {
    return result;
  }

  const keys = Object.keys(cmcd);
  /** @type {!Object<string, string>} */
  const custom = customHeaderMap ?
      cml.cmcd.groupCmcdHeaders_createHeaderMap_(customHeaderMap) : {};

  for (const key of keys) {
    const field = cml.cmcd.CMCD_HEADER_MAP[key] || custom[key] ||
        cml.cmcd.CmcdHeaderField.REQUEST;
    const data = result[field] || (result[field] = {});
    data[key] = cmcd[key];
  }

  return result;
};
