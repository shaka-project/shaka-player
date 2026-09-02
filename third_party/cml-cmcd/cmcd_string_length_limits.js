/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_CUSTOM_KEY_VALUE_MAX_LENGTH');
goog.provide('cml.cmcd.CMCD_STRING_LENGTH_LIMITS');


/**
 * Maps CMCD keys to their maximum string length.
 *
 * @const {!Object<string, number>}
 */
cml.cmcd.CMCD_STRING_LENGTH_LIMITS = {
  sid: 64,
  cid: 128,
  cdn: 128,
  h: 128,
  cen: 64,
};


/**
 * Maximum length for custom key values.
 *
 * @const {number}
 */
cml.cmcd.CMCD_CUSTOM_KEY_VALUE_MAX_LENGTH = 64;
