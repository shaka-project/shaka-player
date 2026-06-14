/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.toCmcdHeaders');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.prepareCmcdData');
goog.require('cml.cmcd.toPreparedCmcdHeaders');


/**
 * Convert a CMCD data object to request headers.
 *
 * @param {cml.cmcd.Cmcd} cmcd The CMCD data object to convert.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding the
 *   CMCD object.
 * @return {!Object<string, string>} The CMCD header shards.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#header-field-definition}
 */
cml.cmcd.toCmcdHeaders = function(cmcd, options) {
  if (!cmcd) {
    return {};
  }

  return cml.cmcd.toPreparedCmcdHeaders(
      cml.cmcd.prepareCmcdData(/** @type {!Object<string, *>} */ (cmcd),
          options),
      options ? options.customHeaderMap : undefined);
};
