/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.toPreparedCmcdHeaders');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdHeaderMap');
goog.require('cml.cmcd.encodeSfDict');
goog.require('cml.cmcd.groupCmcdHeaders');


/**
 * Encode already-prepared CMCD data to CMCD header shards.
 *
 * @param {!cml.cmcd.Cmcd} data The prepared CMCD data to encode.
 * @param {cml.cmcd.CmcdHeaderMap=} customHeaderMap A map of CMCD header
 *   fields to custom CMCD keys.
 * @return {!Object<string, string>} The CMCD header shards.
 */
cml.cmcd.toPreparedCmcdHeaders = function(data, customHeaderMap) {
  /** @type {!Object<string, string>} */
  const result = {};
  const shards = cml.cmcd.groupCmcdHeaders(data, customHeaderMap);

  for (const [f, value] of Object.entries(shards)) {
    const field = /** @type {string} */ (f);
    const shard = cml.cmcd.encodeSfDict(
        /** @type {!Object<string, *>} */ (value), {whitespace: false});
    if (shard) {
      result[field] = shard;
    }
  }

  return result;
};
