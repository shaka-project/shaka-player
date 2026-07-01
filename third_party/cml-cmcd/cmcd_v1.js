/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdV1');


/**
 * CMCD Version 1 data shape.
 *
 * Overrides keys whose types differ from CMCD v2 (`bl`, `br`, `mtp`,
 * `tb` are scalar integers in v1 instead of inner-list values; `nor`
 * is a single relative path string).
 *
 * @typedef {{
 *   bl: (number|undefined),
 *   br: (number|undefined),
 *   mtp: (number|undefined),
 *   nor: (string|undefined),
 *   nrr: (string|undefined),
 *   tb: (number|undefined)
 * }}
 */
cml.cmcd.CmcdV1;
