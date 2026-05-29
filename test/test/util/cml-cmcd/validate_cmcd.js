/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.validateCmcd');

goog.require('cml.cmcd.mergeValidationResults');
goog.require('cml.cmcd.validateCmcdKeys');
goog.require('cml.cmcd.validateCmcdStructure');
goog.require('cml.cmcd.validateCmcdValues');
goog.requireType('cml.cmcd.CmcdValidationOptions');
goog.requireType('cml.cmcd.CmcdValidationResult');


/**
 * Validates a CMCD payload by checking keys, values, and structure.
 *
 * @param {!Object<string, *>} data The CMCD payload to validate.
 * @param {!cml.cmcd.CmcdValidationOptions=} options Validation options.
 * @return {!cml.cmcd.CmcdValidationResult} The validation result.
 */
cml.cmcd.validateCmcd = function(data, options) {
  return cml.cmcd.mergeValidationResults(
      cml.cmcd.validateCmcdKeys(data, options),
      cml.cmcd.validateCmcdValues(data, options),
      cml.cmcd.validateCmcdStructure(data, options));
};
