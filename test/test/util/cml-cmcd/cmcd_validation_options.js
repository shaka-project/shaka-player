/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdValidationOptions');

goog.requireType('cml.cmcd.CmcdReportingMode');
goog.requireType('cml.cmcd.CmcdVersion');


/**
 * Options for CMCD validation functions.
 *
 * @typedef {{
 *   version: (!cml.cmcd.CmcdVersion|undefined),
 *   reportingMode: (!cml.cmcd.CmcdReportingMode|undefined)
 * }}
 */
cml.cmcd.CmcdValidationOptions;
