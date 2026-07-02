/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.toCmcdQuery');

goog.require('cml.cmcd.CMCD_PARAM');
goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.toCmcdUrl');


/**
 * Convert a CMCD data object to a query arg.
 *
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to convert.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding.
 * @return {string} The CMCD query arg.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#query-argument-definition}
 */
cml.cmcd.toCmcdQuery = function(cmcd, options) {
  if (!cmcd) {
    return '';
  }

  const value = cml.cmcd.toCmcdUrl(cmcd, options);

  return `${cml.cmcd.CMCD_PARAM}=${value}`;
};
