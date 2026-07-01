/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReporterConfig');

goog.requireType('cml.cmcd.CmcdEventReportConfig');
goog.requireType('cml.cmcd.CmcdKey');
goog.requireType('cml.cmcd.CmcdTransmissionMode');
goog.requireType('cml.cmcd.CmcdVersion');


/**
 * Configuration for a CMCD reporting component.
 *
 * Upstream CML expresses this as `CmcdRequestReportConfig & {sid, cid,
 * eventTargets}`. Closure typedefs cannot express type intersection;
 * we list the union of all properties (request report config +
 * reporter-specific) directly. All members optional.
 *
 * @typedef {{
 *   version: (cml.cmcd.CmcdVersion|undefined),
 *   enabledKeys: (!Array<cml.cmcd.CmcdKey>|undefined),
 *   transmissionMode: (cml.cmcd.CmcdTransmissionMode|undefined),
 *   sid: (string|undefined),
 *   cid: (string|undefined),
 *   eventTargets: (!Array<cml.cmcd.CmcdEventReportConfig>|undefined)
 * }}
 */
cml.cmcd.CmcdReporterConfig;
