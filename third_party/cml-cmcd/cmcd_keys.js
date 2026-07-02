/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_KEYS');

goog.require('cml.cmcd.CMCD_EVENT_KEYS');
goog.require('cml.cmcd.CMCD_REQUEST_KEYS');
goog.require('cml.cmcd.CMCD_RESPONSE_KEYS');
goog.require('cml.cmcd.CMCD_V1_KEYS');


/**
 * A list of all CMCD keys (deduplicated union of v1 + request + response
 * + event keys).
 *
 * @const {!Array<string>}
 */
cml.cmcd.CMCD_KEYS = [].concat(
    cml.cmcd.CMCD_V1_KEYS,
    cml.cmcd.CMCD_REQUEST_KEYS,
    cml.cmcd.CMCD_RESPONSE_KEYS,
    cml.cmcd.CMCD_EVENT_KEYS).filter(
    (key, index, arr) => arr.indexOf(key) === index);
