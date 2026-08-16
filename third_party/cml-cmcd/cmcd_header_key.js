/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdHeaderKey');


/**
 * A CMCD header key — `keyof typeof CMCD_HEADER_MAP`.
 *
 * Closure cannot express `keyof T` statically; widen to `string`. The
 * effective set is enumerated by the keys of `cml.cmcd.CMCD_HEADER_MAP`.
 *
 * @typedef {string}
 */
cml.cmcd.CmcdHeaderKey;
