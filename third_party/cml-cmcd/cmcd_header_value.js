/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdHeaderValue');

goog.require('cml.cmcd.CmcdRequest');
goog.require('cml.cmcd.CmcdV1');


/**
 * A CMCD header value — `CmcdRequest | CmcdV1`.
 *
 * Closure typedefs cannot express type union of object types cleanly
 * without `|`; we use the parenthesised union form.
 *
 * @typedef {(cml.cmcd.CmcdRequest|cml.cmcd.CmcdV1)}
 */
cml.cmcd.CmcdHeaderValue;
