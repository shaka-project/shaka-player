/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.percentEncode');


/**
 * The sub-delims of RFC 3986 that `encodeURIComponent` does not encode.
 *
 * @private @const {!RegExp}
 */
cml.cmcd.percentEncode_SUB_DELIMS_REGEX_ = /[!'()*]/g;


/** @private @const {!RegExp} */
cml.cmcd.percentEncode_SURROGATE_REGEX_ =
    /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;


/**
 * @param {string} char
 * @return {string}
 * @private
 */
cml.cmcd.percentEncode_encodeSubDelim_ = function(char) {
  return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
};


/**
 * @param {string} match
 * @return {string}
 * @private
 */
cml.cmcd.percentEncode_replaceUnpaired_ = function(match) {
  return match.length === 2 ? match : '�';
};


/**
 * Percent-encode a string for the `CMCD` query parameter.
 *
 * Only the unreserved characters of RFC 3986 stay unencoded: letters,
 * digits, `-`, `.`, `_`, and `~`. The query examples of CTA-5004-B use
 * this encoding. An unpaired surrogate becomes U+FFFD.
 *
 * @param {string} value The string to encode.
 * @return {string} The encoded string.
 */
cml.cmcd.percentEncode = function(value) {
  /** @type {string} */
  let encoded;

  try {
    encoded = encodeURIComponent(value);
  } catch (e) {
    encoded = encodeURIComponent(value.replace(
        cml.cmcd.percentEncode_SURROGATE_REGEX_,
        cml.cmcd.percentEncode_replaceUnpaired_));
  }

  return encoded.replace(cml.cmcd.percentEncode_SUB_DELIMS_REGEX_,
      cml.cmcd.percentEncode_encodeSubDelim_);
};
