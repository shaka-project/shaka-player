/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReportRecorderOptions');

goog.requireType('cml.cmcd.CmcdRecordedReport');
goog.requireType('cml.cmcd.CmcdTransportAdapter');


/**
 * Options for `CmcdReportRecorder.attach()`.
 *
 * @typedef {{
 *   eventTargetUrls: (!Array<string>|undefined),
 *   onReport: ((function(!cml.cmcd.CmcdRecordedReport):void)|undefined),
 *   transports: (!Array<!cml.cmcd.CmcdTransportAdapter>|undefined),
 *   waitTimeout: (number|undefined)
 * }}
 */
cml.cmcd.CmcdReportRecorderOptions;
