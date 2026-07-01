/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.encodePreparedCmcd');

goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.encodeSfDict');


/**
 * Encode already-prepared CMCD data to a structured field dictionary
 * string.
 *
 * @param {!cml.cmcd.Cmcd} data The prepared CMCD data to encode.
 * @return {string} The encoded CMCD string.
 */
cml.cmcd.encodePreparedCmcd = function(data) {
  return cml.cmcd.encodeSfDict(data, {whitespace: false});
};
