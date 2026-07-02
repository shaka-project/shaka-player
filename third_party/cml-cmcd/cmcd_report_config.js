/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReportConfig');

goog.requireType('cml.cmcd.CmcdKey');
goog.requireType('cml.cmcd.CmcdVersion');


/**
 * Configuration for a CMCD report.
 *
 * Upstream CML expresses this as a record type with two optional
 * fields. All members optional.
 *
 * @typedef {{
 *   version: (cml.cmcd.CmcdVersion|undefined),
 *   enabledKeys: (!Array<cml.cmcd.CmcdKey>|undefined)
 * }}
 */
cml.cmcd.CmcdReportConfig;
