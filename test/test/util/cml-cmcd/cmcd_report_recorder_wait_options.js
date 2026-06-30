/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CmcdReportRecorderWaitOptions');


/**
 * Options for the `waitFor*` methods on `CmcdReportRecorder`.
 *
 * `rejectOnTimeout` defaults to `true` (the wait rejects if fewer than `count`
 * reports arrive before `timeout`). Set it to `false` for a soft wait that
 * resolves with whatever reports arrived instead — for callers that validate
 * over the reports they happen to observe and assert nothing about the count.
 *
 * @typedef {{
 *   count: (number|undefined),
 *   timeout: (number|undefined),
 *   rejectOnTimeout: (boolean|undefined)
 * }}
 */
cml.cmcd.CmcdReportRecorderWaitOptions;
