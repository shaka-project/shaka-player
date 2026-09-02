/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_EVENT_MODE');
goog.provide('cml.cmcd.CMCD_REQUEST_MODE');
goog.provide('cml.cmcd.CmcdReportingMode');


/**
 * CMCD event mode variable name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_EVENT_MODE = 'event';

/**
 * CMCD request mode variable name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_REQUEST_MODE = 'request';


/**
 * CMCD reporting mode types.
 *
 * @enum {string}
 */
cml.cmcd.CmcdReportingMode = {
  /**
   * Request mode
   */
  REQUEST: cml.cmcd.CMCD_REQUEST_MODE,

  /**
   * Event mode
   */
  EVENT: cml.cmcd.CMCD_EVENT_MODE,
};
