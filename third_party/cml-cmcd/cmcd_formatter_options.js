/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdFormatterOptions');

goog.require('cml.cmcd.CmcdVersion');


/**
 * Options for formatting CMCD data values.
 *
 * `reportingMode` is a `cml.cmcd.CmcdReportingMode` value (`'request'`
 * or `'event'`); we use plain `string` here to avoid a circular
 * `goog.require` between this typedef and the reporting-mode enum.
 *
 * @typedef {{
 *   version: cml.cmcd.CmcdVersion,
 *   reportingMode: string,
 *   baseUrl: (string|undefined)
 * }}
 */
cml.cmcd.CmcdFormatterOptions;
