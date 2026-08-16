/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdEventReportConfig');

goog.requireType('cml.cmcd.CmcdKey');
goog.requireType('cml.cmcd.CmcdVersion');


/**
 * Configuration for a CMCD event report.
 *
 * Upstream CML expresses this as `CmcdReportConfig & {url, events,
 * interval, batchSize}`. Closure typedefs cannot express type
 * intersection; we list the union of all properties (report config +
 * event-specific) directly. All members except `url` are optional;
 * `url` is the only required field.
 *
 * Upstream further narrows `version` to `typeof CMCD_V2` (event mode
 * is v2-only — v1 has no event mode); we keep the wider
 * `cml.cmcd.CmcdVersion` typedef here since closure cannot express the
 * narrowing constraint and runtime code already gates on `v2`.
 *
 * @typedef {{
 *   version: (cml.cmcd.CmcdVersion|undefined),
 *   enabledKeys: (!Array<cml.cmcd.CmcdKey>|undefined),
 *   url: string,
 *   events: (!Array<string>|undefined),
 *   interval: (number|undefined),
 *   batchSize: (number|undefined)
 * }}
 */
cml.cmcd.CmcdEventReportConfig;
