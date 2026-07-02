/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.appendCmcdHeaders');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.toCmcdHeaders');


/**
 * Append CMCD query args to a header object.
 *
 * @param {!Object<string, string>} headers The headers to append to.
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to append.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Encode options.
 * @return {!Object<string, string>} The headers with the CMCD header
 *   shards appended.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#header-field-definition}
 */
cml.cmcd.appendCmcdHeaders = function(headers, cmcd, options) {
  return Object.assign(headers, cml.cmcd.toCmcdHeaders(cmcd, options));
};
