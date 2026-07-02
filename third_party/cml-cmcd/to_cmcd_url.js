/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.toCmcdUrl');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.encodeCmcd');


/**
 * Convert a CMCD data object to a URL encoded string.
 *
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to convert.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding.
 * @return {string} The URL encoded CMCD data.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#query-argument-definition}
 */
cml.cmcd.toCmcdUrl = function(cmcd, options) {
  if (!cmcd) {
    return '';
  }

  const params = cml.cmcd.encodeCmcd(cmcd, options);

  return encodeURIComponent(params);
};
