/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT');
goog.provide('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST');
goog.provide('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT');
goog.provide('cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_UNKNOWN');
goog.provide('cml.cmcd.CmcdRecordedRequestType');


/** @const {string} */
cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST = 'manifest';

/** @const {string} */
cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT = 'segment';

/** @const {string} */
cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT = 'event';

/** @const {string} */
cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_UNKNOWN = 'unknown';


/**
 * Classification of a captured request.
 *
 * @enum {string}
 */
cml.cmcd.CmcdRecordedRequestType = {
  EVENT: cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_EVENT,
  MANIFEST: cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_MANIFEST,
  SEGMENT: cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_SEGMENT,
  UNKNOWN: cml.cmcd.CMCD_RECORDED_REQUEST_TYPE_UNKNOWN,
};
