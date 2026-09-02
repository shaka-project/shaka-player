/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.CmsdManager');

goog.require('shaka.log');


/**
 * @summary
 * A CmsdManager maintains CMSD state as well as a collection of utility
 * functions.
 * @export
 */
shaka.util.CmsdManager = class {
  /**
   * @param {shaka.extern.CmsdConfiguration} config
   */
  constructor(config) {
    /** @private {shaka.extern.CmsdConfiguration} */
    this.config_ = config;

    /** @private {?Map<string, (boolean | number | string)>} */
    this.staticParams_ = null;

    /** @private {?Map<string, (boolean | number | string)>} */
    this.dynamicParams_ = null;
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.CmsdConfiguration} config
   */
  configure(config) {
    this.config_ = config;
  }


  /**
   * Resets the CmsdManager.
   */
  reset() {
    this.staticParams_ = null;
    this.dynamicParams_ = null;
  }

  /**
   * Called by the Player to provide the headers of the latest request.
   *
   * @param {!Object<string, string>} headers
   */
  processHeaders(headers) {
    if (!this.config_.enabled) {
      return;
    }
    const CmsdManager = shaka.util.CmsdManager;
    const cmsdStatic = headers[CmsdManager.CMSD_STATIC_HEADER_NAME_];
    if (cmsdStatic) {
      const staticParams = this.parseCMSDStatic_(cmsdStatic);
      if (staticParams) {
        this.staticParams_ = staticParams;
      }
    }
    const cmsdDynamic = headers[CmsdManager.CMSD_DYNAMIC_HEADER_NAME_];
    if (cmsdDynamic) {
      const dynamicParams = this.parseCMSDDynamic_(cmsdDynamic);
      if (dynamicParams) {
        this.dynamicParams_ = dynamicParams;
      }
    }
  }

  /**
   * Returns the max bitrate in bits per second. If there is no max bitrate or
   * it's not enabled, it returns null.
   *
   * @return {?number}
   * @export
   */
  getMaxBitrate() {
    const key = shaka.util.CmsdManager.KEYS_.MAX_SUGGESTED_BITRATE;
    if (!this.config_.enabled || !this.config_.applyMaximumSuggestedBitrate ||
        !this.dynamicParams_ || !this.dynamicParams_.has(key)) {
      return null;
    }
    return /** @type {number} */(this.dynamicParams_.get(key)) * 1000;
  }

  /**
   * Returns the estimated throughput in bits per second. If there is no
   * estimated throughput or it's not enabled, it returns null.
   *
   * @return {?number}
   * @export
   */
  getEstimatedThroughput() {
    const key = shaka.util.CmsdManager.KEYS_.ESTIMATED_THROUGHPUT;
    if (!this.config_.enabled || !this.dynamicParams_ ||
        !this.dynamicParams_.has(key)) {
      return null;
    }
    return /** @type {number} */(this.dynamicParams_.get(key)) * 1000;
  }

  /**
   * Returns the response delay in milliseconds. If there is no response delay
   * or it's not enabled, it returns null.
   *
   * @return {?number}
   * @export
   */
  getResponseDelay() {
    const key = shaka.util.CmsdManager.KEYS_.RESPONSE_DELAY;
    if (!this.config_.enabled || !this.dynamicParams_ ||
        !this.dynamicParams_.has(key)) {
      return null;
    }
    return /** @type {number} */(this.dynamicParams_.get(key));
  }

  /**
   * Returns the RTT in milliseconds. If there is no RTT or it's not enabled,
   * it returns null.
   *
   * @return {?number}
   * @export
   */
  getRoundTripTime() {
    const key = shaka.util.CmsdManager.KEYS_.ROUND_TRIP_TIME;
    if (!this.config_.enabled || !this.dynamicParams_ ||
        !this.dynamicParams_.has(key)) {
      return null;
    }
    return /** @type {number} */(this.dynamicParams_.get(key));
  }

  /**
   * Gets the current bandwidth estimate.
   *
   * @param {number} defaultEstimate
   * @return {number} The bandwidth estimate in bits per second.
   * @export
   */
  getBandwidthEstimate(defaultEstimate) {
    const estimatedThroughput = this.getEstimatedThroughput();
    if (!estimatedThroughput) {
      return defaultEstimate;
    }
    const etpWeightRatio = this.config_.estimatedThroughputWeightRatio;
    if (etpWeightRatio > 0 && etpWeightRatio <= 1) {
      return (defaultEstimate * (1 - etpWeightRatio)) +
          (estimatedThroughput * etpWeightRatio);
    }
    return defaultEstimate;
  }

  /**
   * @param {string} headerValue
   * @return {?Map<string, (boolean | number | string)>}
   * @private
   */
  parseCMSDStatic_(headerValue) {
    try {
      const params = new Map();
      const items = headerValue.split(',');
      for (let i = 0; i < items.length; i++) {
        // <key>=<value>
        const substrings = items[i].split('=');
        const key = substrings[0];
        const value = this.parseParameterValue_(substrings[1]);
        params.set(key, value);
      }
      return params;
    } catch (e) {
      shaka.log.warning(
          'Failed to parse CMSD-Static response header value:', e);
      return null;
    }
  }

  /**
   * @param {string} headerValue
   * @return {?Map<string, (boolean | number | string)>}
   * @private
   */
  parseCMSDDynamic_(headerValue) {
    try {
      const params = new Map();
      const items = headerValue.split(';');
      // Server identifier as 1st item
      for (let i = 1; i < items.length; i++) {
        // <key>=<value>
        const substrings = items[i].split('=');
        const key = substrings[0];
        const value = this.parseParameterValue_(substrings[1]);
        params.set(key, value);
      }
      return params;
    } catch (e) {
      shaka.log.warning(
          'Failed to parse CMSD-Dynamic response header value:', e);
      return null;
    }
  }

  /**
   * @param {string} value
   * @return {(boolean|number|string)}
   * @private
   */
  parseParameterValue_(value) {
    // If the value type is BOOLEAN and the value is TRUE, then the equals
    // sign and the value are omitted
    if (!value) {
      return true;
    }
    // Check if boolean 'false'
    if (value.toLowerCase() === 'false') {
      return false;
    }
    // Check if a number
    if (/^[-0-9]/.test(value)) {
      return parseInt(value, 10);
    }
    // Value is a string, remove double quotes from string value
    return value.replace(/["]+/g, '');
  }
};

/**
 * @const {string}
 * @private
 */
shaka.util.CmsdManager.CMSD_STATIC_HEADER_NAME_ = 'cmsd-static';

/**
 * @const {string}
 * @private
 */
shaka.util.CmsdManager.CMSD_DYNAMIC_HEADER_NAME_ = 'cmsd-dynamic';

/**
 * @enum {string}
 * @private
 */
shaka.util.CmsdManager.KEYS_ = {
  AVAILABILITY_TIME: 'at',
  DURESS: 'du',
  ENCODED_BITRATE: 'br',
  ESTIMATED_THROUGHPUT: 'etp',
  HELD_TIME: 'ht',
  INTERMEDIARY_IDENTIFIER: 'n',
  MAX_SUGGESTED_BITRATE: 'mb',
  NEXT_OBJECT_RESPONSE: 'nor',
  NEXT_RANGE_RESPONSE: 'nrr',
  OBJECT_DURATION: 'd',
  OBJECT_TYPE: 'ot',
  RESPONSE_DELAY: 'rd',
  ROUND_TRIP_TIME: 'rtt',
  STARTUP: 'su',
  STREAM_TYPE: 'st',
  STREAMING_FORMAT: 'sf',
  VERSION: 'v',
};
