/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdValidationIssue');

goog.requireType('cml.cmcd.CmcdValidationSeverity');


/**
 * Describes a single validation issue found in a CMCD payload.
 *
 * The `key` field identifies the CMCD key associated with the issue,
 * or is undefined for structural issues not tied to a specific key.
 *
 * @typedef {{
 *   key: (string|undefined),
 *   message: string,
 *   severity: string
 * }}
 */
cml.cmcd.CmcdValidationIssue;
