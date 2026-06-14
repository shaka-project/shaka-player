/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_HEADER_FIELDS');
goog.provide('cml.cmcd.CMCD_OBJECT');
goog.provide('cml.cmcd.CMCD_REQUEST');
goog.provide('cml.cmcd.CMCD_SESSION');
goog.provide('cml.cmcd.CMCD_STATUS');
goog.provide('cml.cmcd.CmcdHeaderField');


/**
 * CMCD object header name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_OBJECT = 'CMCD-Object';

/**
 * CMCD request header name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_REQUEST = 'CMCD-Request';

/**
 * CMCD session header name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_SESSION = 'CMCD-Session';

/**
 * CMCD status header name.
 *
 * @const {string}
 */
cml.cmcd.CMCD_STATUS = 'CMCD-Status';


/**
 * CMCD header fields.
 *
 * @enum {string}
 */
cml.cmcd.CmcdHeaderField = {
  /**
   * keys whose values vary with the object being requested.
   */
  OBJECT: cml.cmcd.CMCD_OBJECT,

  /**
   * keys whose values vary with each request.
   */
  REQUEST: cml.cmcd.CMCD_REQUEST,

  /**
   * keys whose values are expected to be invariant over the life of
   * the session.
   */
  SESSION: cml.cmcd.CMCD_SESSION,

  /**
   * keys whose values do not vary with every request or object.
   */
  STATUS: cml.cmcd.CMCD_STATUS,
};


/**
 * All CMCD header fields as an array.
 *
 * @const {!Array<string>}
 */
cml.cmcd.CMCD_HEADER_FIELDS = [
  cml.cmcd.CMCD_OBJECT,
  cml.cmcd.CMCD_REQUEST,
  cml.cmcd.CMCD_SESSION,
  cml.cmcd.CMCD_STATUS,
];
