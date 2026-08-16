/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.encodeCmcd');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.encodePreparedCmcd');
goog.require('cml.cmcd.prepareCmcdData');


/**
 * Encode a CMCD object to a string.
 *
 * @param {cml.cmcd.Cmcd} cmcd The CMCD object to encode.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding.
 * @return {string} The encoded CMCD string.
 *
 * @see {@link https://cta-wave.github.io/Resources/common-media-client-data--cta-5004-b.html#payload-definition-for-headers-and-query-argument-transmission}
 */
cml.cmcd.encodeCmcd = function(cmcd, options) {
  if (!cmcd) {
    return '';
  }

  return cml.cmcd.encodePreparedCmcd(
      cml.cmcd.prepareCmcdData(/** @type {!Object<string, *>} */ (cmcd),
          options));
};
