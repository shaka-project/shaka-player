/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdFormatterMap');

goog.require('cml.cmcd.CmcdFormatter');


/**
 * A map of CMCD keys to format functions.
 *
 * Upstream CML: `Record<CmcdKey, CmcdFormatter>`.
 *
 * @typedef {!Object<string, cml.cmcd.CmcdFormatter>}
 */
cml.cmcd.CmcdFormatterMap;
