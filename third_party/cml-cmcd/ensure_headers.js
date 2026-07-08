/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.ensureHeaders');


/**
 * Converts a record of header fields to a `Headers` instance if
 * necessary.
 *
 * @param {(!Object<string, string>|!Headers)} headers A `Headers`
 *   instance or a plain record of header fields.
 * @return {!Headers} A `Headers` instance.
 */
cml.cmcd.ensureHeaders = function(headers) {
  return headers instanceof Headers ? headers : new Headers(headers);
};
