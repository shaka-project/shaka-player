/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.resolveVersion');

goog.require('cml.cmcd.CMCD_V1');


/**
 * Resolves the CMCD version from explicit options, the payload's `v`
 * key, or the default (v1).
 *
 * Upstream signature uses `CmcdValidationOptions` for the second arg;
 * since validation typedefs are not vendored (spec § "Excluded
 * validators"), we inline the option shape (only the `version` field
 * is read).
 *
 * @param {!Object<string, *>} data
 * @param {{version: (number|undefined)}=} options
 * @return {number}
 */
cml.cmcd.resolveVersion = function(data, options) {
  if (options && (options.version === 1 || options.version === 2)) {
    return options.version;
  }

  const payloadVersion = data['v'];
  if (payloadVersion === 1 || payloadVersion === 2) {
    return /** @type {number} */ (payloadVersion);
  }

  return cml.cmcd.CMCD_V1;
};
