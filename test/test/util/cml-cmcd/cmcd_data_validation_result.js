/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdDataValidationResult');

goog.requireType('cml.cmcd.CmcdValidationIssue');


/**
 * The result of validating a single CMCD payload (headers or query).
 *
 * Extends {@link cml.cmcd.CmcdValidationResult} with the decoded
 * {@link cml.cmcd.CmcdData}.
 *
 * @typedef {{
 *   valid: boolean,
 *   issues: !Array<!cml.cmcd.CmcdValidationIssue>,
 *   data: !Object<string, *>
 * }}
 */
cml.cmcd.CmcdDataValidationResult;
