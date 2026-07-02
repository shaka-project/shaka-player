/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.validateCmcdValues');

goog.require('cml.cmcd.CMCD_CUSTOM_KEY_VALUE_MAX_LENGTH');
goog.require('cml.cmcd.CMCD_KEY_TYPES');
goog.require('cml.cmcd.CMCD_KEY_TYPE_BOOLEAN');
goog.require('cml.cmcd.CMCD_KEY_TYPE_INTEGER');
goog.require('cml.cmcd.CMCD_KEY_TYPE_NUMBER');
goog.require('cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST');
goog.require('cml.cmcd.CMCD_KEY_TYPE_STRING');
goog.require('cml.cmcd.CMCD_KEY_TYPE_STRING_LIST');
goog.require('cml.cmcd.CMCD_KEY_TYPE_TOKEN');
goog.require('cml.cmcd.CMCD_STRING_LENGTH_LIMITS');
goog.require('cml.cmcd.CMCD_TOKEN_VALUES');
goog.require('cml.cmcd.CMCD_V1');
goog.require('cml.cmcd.CMCD_V1_KEY_TYPE_OVERRIDES');
goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR');
goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING');
goog.require('cml.cmcd.SfItem');
goog.require('cml.cmcd.isCmcdCustomKey');
goog.require('cml.cmcd.resolveVersion');
goog.requireType('cml.cmcd.CmcdValidationIssue');
goog.requireType('cml.cmcd.CmcdValidationOptions');
goog.requireType('cml.cmcd.CmcdValidationResult');


/** @private @const {!Set<string>} */
cml.cmcd.validateCmcdValues_HUNDRED_ROUNDING_KEYS_ =
    new Set(['bl', 'dl', 'mtp', 'rtp', 'tbl']);

/** @private @const {!Set<string>} */
cml.cmcd.validateCmcdValues_INTEGER_ROUNDING_KEYS_ =
    new Set(['br', 'd', 'tb']);


/**
 * @param {*} value
 * @return {boolean}
 * @private
 */
cml.cmcd.validateCmcdValues_isFiniteNumber_ = function(value) {
  return typeof value === 'number' && Number.isFinite(value);
};


/**
 * @param {string} key
 * @param {*} value
 * @param {!Array<!cml.cmcd.CmcdValidationIssue>} issues
 * @private
 */
cml.cmcd.validateCmcdValues_validateListValue_ = function(key, value, issues) {
  if (!Array.isArray(value)) {
    issues.push({
      key,
      message: `Key "${key}" must be an array.`,
      severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
    });
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const element = value[i];
    if (element instanceof cml.cmcd.SfItem) {
      if (!cml.cmcd.validateCmcdValues_isFiniteNumber_(element.value)) {
        issues.push({
          key,
          message: `Key "${key}" array element [${i}] must be a finite number.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    } else if (!cml.cmcd.validateCmcdValues_isFiniteNumber_(element)) {
      issues.push({
        key,
        message: `Key "${key}" array element [${i}] must be a finite number.`,
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
  }
};


/**
 * @param {string} key
 * @param {*} value
 * @param {!Array<!cml.cmcd.CmcdValidationIssue>} issues
 * @private
 */
cml.cmcd.validateCmcdValues_validateStringArrayValue_ =
    function(key, value, issues) {
  if (!Array.isArray(value)) {
    issues.push({
      key,
      message: `Key "${key}" must be an array.`,
      severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
    });
    return;
  }
  for (let i = 0; i < value.length; i++) {
    const element = value[i];
    if (element instanceof cml.cmcd.SfItem) {
      if (typeof element.value !== 'string') {
        issues.push({
          key,
          message: `Key "${key}" array element [${i}] must be a string.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    } else if (typeof element !== 'string') {
      issues.push({
        key,
        message: `Key "${key}" array element [${i}] must be a string.`,
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
  }
};


/**
 * Validates that all values in a CMCD payload conform to the expected
 * types and constraints.
 *
 * @param {!Object<string, *>} data The CMCD payload to validate.
 * @param {!cml.cmcd.CmcdValidationOptions=} options Validation options.
 * @return {!cml.cmcd.CmcdValidationResult} The validation result.
 */
cml.cmcd.validateCmcdValues = function(data, options) {
  const version = cml.cmcd.resolveVersion(data, options);
  const issues = [];

  for (const key in data) {
    const value = data[key];
    if (cml.cmcd.isCmcdCustomKey(key)) {
      // Custom key values must be string or token, max 64 chars.
      if (typeof value !== 'string') {
        issues.push({
          key,
          message: `Custom key "${key}" value must be a string or token.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      } else if (value.length > cml.cmcd.CMCD_CUSTOM_KEY_VALUE_MAX_LENGTH) {
        issues.push({
          key,
          message: `Custom key "${key}" value exceeds maximum length of ${cml.cmcd.CMCD_CUSTOM_KEY_VALUE_MAX_LENGTH}.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
      continue;
    }

    // Version value check.
    if (key === 'v') {
      if (value !== 1 && value !== 2) {
        issues.push({
          key,
          message: `Key "v" must be 1 or 2.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
      continue;
    }

    // Determine expected type.
    let expectedType = cml.cmcd.CMCD_KEY_TYPES[key];
    if (!expectedType) {
      continue;
    }

    if (version === cml.cmcd.CMCD_V1 && key in cml.cmcd.CMCD_V1_KEY_TYPE_OVERRIDES) {
      expectedType = cml.cmcd.CMCD_V1_KEY_TYPE_OVERRIDES[key];
    }

    switch (expectedType) {
      case cml.cmcd.CMCD_KEY_TYPE_INTEGER:
        if (!cml.cmcd.validateCmcdValues_isFiniteNumber_(value) ||
            !Number.isInteger(value)) {
          issues.push({
            key,
            message: `Key "${key}" must be a finite integer.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        } else if (
            cml.cmcd.validateCmcdValues_HUNDRED_ROUNDING_KEYS_.has(key) &&
            /** @type {number} */ (value) % 100 !== 0) {
          issues.push({
            key,
            message: `Key "${key}" should be rounded to the nearest 100.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING,
          });
        }
        break;

      case cml.cmcd.CMCD_KEY_TYPE_NUMBER:
        if (!cml.cmcd.validateCmcdValues_isFiniteNumber_(value)) {
          issues.push({
            key,
            message: `Key "${key}" must be a finite number.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        } else if (
            cml.cmcd.validateCmcdValues_HUNDRED_ROUNDING_KEYS_.has(key) &&
            /** @type {number} */ (value) % 100 !== 0) {
          issues.push({
            key,
            message: `Key "${key}" should be rounded to the nearest 100.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING,
          });
        } else if (
            cml.cmcd.validateCmcdValues_INTEGER_ROUNDING_KEYS_.has(key) &&
            !Number.isInteger(value)) {
          issues.push({
            key,
            message: `Key "${key}" should be rounded to an integer.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING,
          });
        }
        break;

      case cml.cmcd.CMCD_KEY_TYPE_BOOLEAN:
        if (typeof value !== 'boolean') {
          issues.push({
            key,
            message: `Key "${key}" must be a boolean.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        }
        break;

      case cml.cmcd.CMCD_KEY_TYPE_STRING:
        if (typeof value !== 'string') {
          issues.push({
            key,
            message: `Key "${key}" must be a string.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        } else if (
            key in cml.cmcd.CMCD_STRING_LENGTH_LIMITS &&
            value.length > cml.cmcd.CMCD_STRING_LENGTH_LIMITS[key]) {
          issues.push({
            key,
            message: `Key "${key}" exceeds maximum length of ${cml.cmcd.CMCD_STRING_LENGTH_LIMITS[key]}.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        }
        break;

      case cml.cmcd.CMCD_KEY_TYPE_TOKEN: {
        const validValues = cml.cmcd.CMCD_TOKEN_VALUES[key];
        if (validValues && !validValues.includes(/** @type {string} */ (value))) {
          issues.push({
            key,
            message: `Key "${key}" has invalid token value "${String(value)}". Expected one of: ${validValues.join(', ')}.`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        }
        break;
      }

      case cml.cmcd.CMCD_KEY_TYPE_NUMBER_LIST:
        cml.cmcd.validateCmcdValues_validateListValue_(key, value, issues);
        break;

      case cml.cmcd.CMCD_KEY_TYPE_STRING_LIST:
        cml.cmcd.validateCmcdValues_validateStringArrayValue_(
            key, value, issues);
        break;
    }
  }

  return {
    valid: issues.every(
        i => i.severity !== cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR),
    issues,
  };
};
