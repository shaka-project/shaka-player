/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdVersion');


/**
 * The version of the CMCD specification — `1` (`CMCD_V1`) or `2`
 * (`CMCD_V2`).
 *
 * Upstream CML uses `typeof CMCD_V1 | typeof CMCD_V2`; closure can
 * express this as a literal numeric union.
 *
 * @typedef {number}
 */
cml.cmcd.CmcdVersion;
