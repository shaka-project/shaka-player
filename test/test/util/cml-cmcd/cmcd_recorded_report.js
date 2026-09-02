/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdRecordedReport');


/**
 * A CMCD report captured by `CmcdReportRecorder`, normalized to a
 * plain HttpRequest-shaped object regardless of the transport.
 *
 * The `request` shape is:
 *   {url: string, method: string, headers: !Object<string, string>,
 *    body: (string|undefined)}
 * Using `!Object<string, *>` keeps Closure happy without forcing a full
 * typedef for HttpRequest.
 *
 * @typedef {{
 *   request: !Object<string, *>,
 *   type: string,
 *   reportingMode: string,
 *   timestamp: number
 * }}
 */
cml.cmcd.CmcdRecordedReport;
