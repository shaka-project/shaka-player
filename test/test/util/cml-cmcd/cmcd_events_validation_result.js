/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdEventsValidationResult');

goog.requireType('cml.cmcd.CmcdValidationIssue');


/**
 * The result of validating a multi-line CMCD event payload.
 *
 * Extends {@link cml.cmcd.CmcdValidationResult} with an array of decoded
 * {@link cml.cmcd.CmcdData} objects, one per event line.
 *
 * @typedef {{
 *   valid: boolean,
 *   issues: !Array<!cml.cmcd.CmcdValidationIssue>,
 *   data: !Array<!Object<string, *>>
 * }}
 */
cml.cmcd.CmcdEventsValidationResult;
