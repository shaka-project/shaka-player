/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRequestReportConfig');

goog.requireType('cml.cmcd.CmcdKey');
goog.requireType('cml.cmcd.CmcdTransmissionMode');
goog.requireType('cml.cmcd.CmcdVersion');


/**
 * Configuration for a CMCD request report.
 *
 * Upstream CML expresses this as `CmcdReportConfig & {transmissionMode}`.
 * Closure typedefs cannot express type intersection; we list the union
 * of all properties (report config + request-specific) directly. All
 * members optional.
 *
 * @typedef {{
 *   version: (cml.cmcd.CmcdVersion|undefined),
 *   enabledKeys: (!Array<cml.cmcd.CmcdKey>|undefined),
 *   transmissionMode: (cml.cmcd.CmcdTransmissionMode|undefined)
 * }}
 */
cml.cmcd.CmcdRequestReportConfig;
