/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdKey');


/**
 * A CMCD key — the union of every defined v1 and v2 wire key
 * (`keyof Cmcd | keyof CmcdV1`).
 *
 * Closure cannot express `keyof T` statically; widen to `string`. The
 * effective set at runtime is enumerated by `cml.cmcd.CMCD_KEYS`.
 *
 * @typedef {string}
 */
cml.cmcd.CmcdKey;
