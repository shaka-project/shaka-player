/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.appendCmcdQuery');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.toCmcdQuery');


/** @private @const {!RegExp} */
cml.cmcd.appendCmcdQuery_REGEX_ = /CMCD=[^&#]+/;


/**
 * Append CMCD query args to a URL.
 *
 * @param {string} url The URL to append to.
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to append.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding the
 *   CMCD object.
 * @return {string} The URL with the CMCD query args appended.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#query-argument-definition}
 */
cml.cmcd.appendCmcdQuery = function(url, cmcd, options) {
  const query = cml.cmcd.toCmcdQuery(cmcd, options);
  if (!query) {
    return url;
  }

  if (cml.cmcd.appendCmcdQuery_REGEX_.test(url)) {
    return url.replace(cml.cmcd.appendCmcdQuery_REGEX_, query);
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${query}`;
};
