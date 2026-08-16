/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_HEADERS');
goog.provide('cml.cmcd.CMCD_JSON');
goog.provide('cml.cmcd.CMCD_QUERY');
goog.provide('cml.cmcd.CmcdTransmissionMode');


/**
 * CMCD `query` transmission mode.
 *
 * @const {string}
 */
cml.cmcd.CMCD_QUERY = 'query';

/**
 * CMCD `headers` transmission mode.
 *
 * @const {string}
 */
cml.cmcd.CMCD_HEADERS = 'headers';

/**
 * CMCD `json` transmission mode.
 *
 * @deprecated JSON transmission mode is deprecated and will be removed
 *     in future versions.
 *
 * @const {string}
 */
cml.cmcd.CMCD_JSON = 'json';


/**
 * CMCD transmission modes.
 *
 * @enum {string}
 */
cml.cmcd.CmcdTransmissionMode = {
  /**
   * JSON
   *
   * @deprecated JSON transmission mode is deprecated and will be
   *     removed in future versions.
   */
  JSON: cml.cmcd.CMCD_JSON,

  /**
   * Query string
   */
  QUERY: cml.cmcd.CMCD_QUERY,

  /**
   * Request headers
   */
  HEADERS: cml.cmcd.CMCD_HEADERS,
};
