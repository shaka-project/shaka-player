/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.validateCmcdKeys');

goog.require('cml.cmcd.CMCD_KEYS');
goog.require('cml.cmcd.CMCD_V1');
goog.require('cml.cmcd.CMCD_V1_KEYS');
goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR');
goog.require('cml.cmcd.isCmcdCustomKey');
goog.require('cml.cmcd.resolveVersion');
goog.requireType('cml.cmcd.CmcdValidationOptions');
goog.requireType('cml.cmcd.CmcdValidationResult');


/** @private @const {!Set<string>} */
cml.cmcd.validateCmcdKeys_V1_KEY_SET_ = new Set(cml.cmcd.CMCD_V1_KEYS);

/** @private @const {!Set<string>} */
cml.cmcd.validateCmcdKeys_KEY_SET_ = new Set(cml.cmcd.CMCD_KEYS);


/**
 * Validates that all keys in a CMCD payload are recognized spec keys or
 * valid custom keys.
 *
 * @param {!Object<string, *>} data The CMCD payload to validate.
 * @param {!cml.cmcd.CmcdValidationOptions=} options Validation options.
 * @return {!cml.cmcd.CmcdValidationResult} The validation result.
 */
cml.cmcd.validateCmcdKeys = function(data, options) {
  const version = cml.cmcd.resolveVersion(data, options);
  const validKeySet = version === cml.cmcd.CMCD_V1 ?
      cml.cmcd.validateCmcdKeys_V1_KEY_SET_ :
      cml.cmcd.validateCmcdKeys_KEY_SET_;
  const issues = [];

  for (const key of Object.keys(data)) {
    if (cml.cmcd.isCmcdCustomKey(key)) {
      continue;
    }

    if (!validKeySet.has(key)) {
      issues.push({
        key,
        message: `Unknown CMCD key "${key}" for version ${version}.`,
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
};
