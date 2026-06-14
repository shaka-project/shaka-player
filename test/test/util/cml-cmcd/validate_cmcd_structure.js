/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.validateCmcdStructure');

goog.require('cml.cmcd.CMCD_EVENT_CUSTOM_EVENT');
goog.require('cml.cmcd.CMCD_EVENT_ERROR');
goog.require('cml.cmcd.CMCD_EVENT_KEYS');
goog.require('cml.cmcd.CMCD_EVENT_MODE');
goog.require('cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED');
goog.require('cml.cmcd.CMCD_REQUEST_MODE');
goog.require('cml.cmcd.CMCD_RESPONSE_KEYS');
goog.require('cml.cmcd.CMCD_STATE_EVENT_FIELDS');
goog.require('cml.cmcd.CMCD_V1');
goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR');
goog.require('cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING');
goog.require('cml.cmcd.resolveVersion');
goog.requireType('cml.cmcd.CmcdValidationOptions');
goog.requireType('cml.cmcd.CmcdValidationResult');


/**
 * Validates the structural rules of a CMCD payload.
 *
 * @param {!Object<string, *>} data The CMCD payload to validate.
 * @param {!cml.cmcd.CmcdValidationOptions=} options Validation options.
 * @return {!cml.cmcd.CmcdValidationResult} The validation result.
 */
cml.cmcd.validateCmcdStructure = function(data, options) {
  const version = cml.cmcd.resolveVersion(data, options);
  const issues = [];

  // Request mode checks.
  if (options && options.reportingMode === cml.cmcd.CMCD_REQUEST_MODE) {
    for (const key of cml.cmcd.CMCD_EVENT_KEYS) {
      if (key in data) {
        issues.push({
          key,
          message: `Event key "${key}" must not be present in request mode.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    }
    for (const key of cml.cmcd.CMCD_RESPONSE_KEYS) {
      if (key in data) {
        issues.push({
          key,
          message: `Response key "${key}" must not be present in request mode.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    }
  }

  // Event mode checks.
  if (options && options.reportingMode === cml.cmcd.CMCD_EVENT_MODE) {
    if (!('e' in data)) {
      issues.push({
        key: 'e',
        message: 'Event mode requires the "e" key to be present.',
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
    if (!('ts' in data)) {
      issues.push({
        key: 'ts',
        message: 'Event mode requires the "ts" key to be present.',
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
  }

  // Custom event checks.
  if ('e' in data) {
    if (data['e'] === cml.cmcd.CMCD_EVENT_CUSTOM_EVENT) {
      if (!('cen' in data)) {
        issues.push({
          key: 'cen',
          message: 'Custom event (e="ce") requires the "cen" key to be present.',
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    } else {
      if ('cen' in data) {
        issues.push({
          key: 'cen',
          message: 'The "cen" key must only be present when e="ce".',
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    }

    // Response-received key restriction and required url.
    if (data['e'] === cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED) {
      if (!('url' in data)) {
        issues.push({
          key: 'url',
          message: 'Response received event (e="rr") requires the "url" key to be present.',
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    } else {
      for (const key of cml.cmcd.CMCD_RESPONSE_KEYS) {
        if (key in data) {
          issues.push({
            key,
            message: `Response key "${key}" must only be present when e="rr".`,
            severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
          });
        }
      }
    }

    // State-change events require their associated field.
    for (const [eventType, requiredField] of cml.cmcd.CMCD_STATE_EVENT_FIELDS) {
      if (data['e'] === eventType && !(requiredField in data)) {
        issues.push({
          key: requiredField,
          message: `State-change event (e="${eventType}") requires the "${requiredField}" key to be present.`,
          severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
        });
      }
    }

    // Error event requires ec.
    if (data['e'] === cml.cmcd.CMCD_EVENT_ERROR && !('ec' in data)) {
      issues.push({
        key: 'ec',
        message: 'Error event (e="e") requires the "ec" key to be present.',
        severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
      });
    }
  }

  // Version key checks.
  if ('v' in data && data['v'] !== 1 && data['v'] !== 2) {
    issues.push({
      key: 'v',
      message: `Unsupported CMCD version "${String(data['v'])}". Expected 1 or 2.`,
      severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
    });
  } else if (version > 1 && !('v' in data)) {
    issues.push({
      key: 'v',
      message: 'Version 2 payloads require the "v" key to be present.',
      severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
    });
  } else if (version === cml.cmcd.CMCD_V1 && 'v' in data) {
    issues.push({
      key: 'v',
      message: 'Version 1 payloads should omit the "v" key (v1 is the default).',
      severity: cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING,
    });
  }

  return {
    valid: issues.every(
        i => i.severity !== cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR),
    issues,
  };
};
