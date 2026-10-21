/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.appendCmcdQuery');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.encodeCmcd');
goog.require('cml.cmcd.replaceCmcdParam');


/**
 * Append CMCD query args to a URL.
 *
 * If the URL has a `CMCD` parameter, the new value replaces it in place.
 * The other parameters and the fragment stay as they are. If the data has
 * no keys to send, the function returns the URL unchanged.
 *
 * @param {string} url The URL to append to.
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to append.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding.
 * @return {string} The URL with the CMCD query args appended.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#query-argument-definition}
 */
cml.cmcd.appendCmcdQuery = function(url, cmcd, options) {
  const value = cmcd ? cml.cmcd.encodeCmcd(cmcd, options) : '';

  return value ? cml.cmcd.replaceCmcdParam(url, value) : url;
};
