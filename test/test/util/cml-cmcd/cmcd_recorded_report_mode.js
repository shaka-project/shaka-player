/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_RECORDED_REPORT_MODE_EVENT');
goog.provide('cml.cmcd.CMCD_RECORDED_REPORT_MODE_HEADER');
goog.provide('cml.cmcd.CMCD_RECORDED_REPORT_MODE_QUERY');
goog.provide('cml.cmcd.CmcdRecordedReportMode');


/** @const {string} */
cml.cmcd.CMCD_RECORDED_REPORT_MODE_QUERY = 'query';

/** @const {string} */
cml.cmcd.CMCD_RECORDED_REPORT_MODE_HEADER = 'header';

/** @const {string} */
cml.cmcd.CMCD_RECORDED_REPORT_MODE_EVENT = 'event';


/**
 * Reporting mode under which a captured report was observed.
 *
 * @enum {string}
 */
cml.cmcd.CmcdRecordedReportMode = {
  QUERY: cml.cmcd.CMCD_RECORDED_REPORT_MODE_QUERY,
  HEADER: cml.cmcd.CMCD_RECORDED_REPORT_MODE_HEADER,
  EVENT: cml.cmcd.CMCD_RECORDED_REPORT_MODE_EVENT,
};
