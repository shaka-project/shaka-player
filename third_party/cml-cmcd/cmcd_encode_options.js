/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdEncodeOptions');

goog.require('cml.cmcd.CmcdFormatterMap');
goog.require('cml.cmcd.CmcdHeaderMap');
goog.require('cml.cmcd.CmcdKey');
goog.require('cml.cmcd.CmcdVersion');


/**
 * Options for encoding CMCD values.
 *
 * `reportingMode` is a `cml.cmcd.CmcdReportingMode` value (`'request'`
 * or `'event'`); we use plain `string` here to avoid a circular
 * `goog.require` between this typedef and the reporting-mode enum.
 *
 * @typedef {{
 *   version: (cml.cmcd.CmcdVersion|undefined),
 *   reportingMode: (string|undefined),
 *   formatters: (cml.cmcd.CmcdFormatterMap|undefined),
 *   customHeaderMap: (cml.cmcd.CmcdHeaderMap|undefined),
 *   filter: ((function(cml.cmcd.CmcdKey): boolean)|undefined),
 *   baseUrl: (string|undefined),
 *   events: (!Array<string>|undefined)
 * }}
 */
cml.cmcd.CmcdEncodeOptions;
