/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdValidationResult');

goog.requireType('cml.cmcd.CmcdValidationIssue');


/**
 * The result of validating a CMCD payload.
 *
 * `valid` is true when there are zero errors (warnings are acceptable).
 *
 * @typedef {{
 *   valid: boolean,
 *   issues: !Array<!cml.cmcd.CmcdValidationIssue>
 * }}
 */
cml.cmcd.CmcdValidationResult;
