/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRequestKey');


/**
 * A CMCD request key — `keyof CmcdRequest | 'nrr'`.
 *
 * Closure cannot express `keyof T` statically; widen to `string`. The
 * effective set is enumerated by `cml.cmcd.CMCD_REQUEST_KEYS`.
 *
 * @typedef {string}
 */
cml.cmcd.CmcdRequestKey;
