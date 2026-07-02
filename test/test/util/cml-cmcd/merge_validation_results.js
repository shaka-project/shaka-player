/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.mergeValidationResults');

goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR');
goog.requireType('cml.cmcd.CmcdValidationResult');


/**
 * Merges multiple validation results into a single result.
 *
 * `valid` is true iff every input result is valid (i.e. no issue has
 * severity "error"). `issues` is the concatenation of all input issues.
 *
 * @param {...!cml.cmcd.CmcdValidationResult} results
 * @return {!cml.cmcd.CmcdValidationResult}
 */
cml.cmcd.mergeValidationResults = function(...results) {
  const issues = results.flatMap(r => r.issues);
  return {
    valid: issues.every(i => i.severity !== cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR),
    issues,
  };
};
