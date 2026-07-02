/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR');
goog.provide('cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING');
goog.provide('cml.cmcd.CmcdValidationSeverity');


/**
 * Validation issue severity: an error.
 *
 * @const {string}
 */
cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR = 'error';

/**
 * Validation issue severity: a warning.
 *
 * @const {string}
 */
cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING = 'warning';


/**
 * Severity of a CMCD validation issue.
 *
 * @enum {string}
 */
cml.cmcd.CmcdValidationSeverity = {
  ERROR: cml.cmcd.CMCD_VALIDATION_SEVERITY_ERROR,
  WARNING: cml.cmcd.CMCD_VALIDATION_SEVERITY_WARNING,
};
