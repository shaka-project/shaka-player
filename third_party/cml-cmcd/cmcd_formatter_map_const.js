/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.CMCD_FORMATTER_MAP');

goog.require('cml.cmcd.CmcdFormatterMap');
goog.require('cml.cmcd.CmcdFormatterOptions');
goog.require('cml.cmcd.CmcdValue');
goog.require('cml.cmcd.SfItem');
goog.require('cml.cmcd.getBaseUrl');
goog.require('cml.cmcd.urlToRelativePath');


/**
 * @param {cml.cmcd.CmcdValue} value
 * @return {(number|!cml.cmcd.SfItem)}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_roundValue_ = function(value) {
  if (value instanceof cml.cmcd.SfItem) {
    return new cml.cmcd.SfItem(
        Math.round(/** @type {number} */ (value.value)), value.params);
  }
  return Math.round(/** @type {number} */ (value));
};


/**
 * @param {cml.cmcd.CmcdValue} value
 * @return {*}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_toRounded_ = function(value) {
  if (Array.isArray(value)) {
    return value.map(cml.cmcd.CMCD_FORMATTER_MAP_roundValue_);
  }
  return cml.cmcd.CMCD_FORMATTER_MAP_roundValue_(value);
};


/**
 * @param {cml.cmcd.CmcdValue} value
 * @param {cml.cmcd.CmcdFormatterOptions} options
 * @return {*}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_toUrlSafe_ = function(value, options) {
  if (Array.isArray(value)) {
    return value.map(
        (item) => /** @type {string} */ (
            cml.cmcd.CMCD_FORMATTER_MAP_toUrlSafe_(item, options)));
  }

  if (value instanceof cml.cmcd.SfItem && typeof value.value === 'string') {
    return new cml.cmcd.SfItem(
        cml.cmcd.CMCD_FORMATTER_MAP_toUrlSafe_(value.value, options),
        value.params);
  } else {
    if (options.baseUrl) {
      value = cml.cmcd.urlToRelativePath(
          /** @type {string} */ (value),
          cml.cmcd.getBaseUrl(options.baseUrl));
    }
    return options.version === 1 ?
        encodeURIComponent(/** @type {string} */ (value)) :
        /** @type {string} */ (value);
  }
};


/**
 * @param {cml.cmcd.CmcdValue} value
 * @return {(number|!cml.cmcd.SfItem)}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_hundredValue_ = function(value) {
  if (value instanceof cml.cmcd.SfItem) {
    return new cml.cmcd.SfItem(
        Math.round(/** @type {number} */ (value.value) / 100) * 100,
        value.params);
  }
  return Math.round(/** @type {number} */ (value) / 100) * 100;
};


/**
 * @param {cml.cmcd.CmcdValue} value
 * @return {*}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_toHundred_ = function(value) {
  if (Array.isArray(value)) {
    return value.map(cml.cmcd.CMCD_FORMATTER_MAP_hundredValue_);
  }
  return cml.cmcd.CMCD_FORMATTER_MAP_hundredValue_(value);
};


/**
 * @param {cml.cmcd.CmcdValue} value
 * @param {cml.cmcd.CmcdFormatterOptions} options
 * @return {*}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_nor_ = function(value, options) {
  let norValue = value;

  if (options.version >= 2) {
    if (value instanceof cml.cmcd.SfItem && typeof value.value === 'string') {
      norValue = new cml.cmcd.SfItem([value]);
    } else if (typeof value === 'string') {
      norValue = [value];
    }
  }

  return cml.cmcd.CMCD_FORMATTER_MAP_toUrlSafe_(norValue, options);
};


/**
 * The default formatters for CMCD values.
 *
 * Upstream CML: `Record<string, CmcdFormatter>`. The implementation
 * functions are kept verbatim (modulo TS-isms like `instanceof SfItem`
 * referencing the CML class, which we route through our `cml_sfv.js`
 * shim).
 *
 * @const {!cml.cmcd.CmcdFormatterMap}
 */
cml.cmcd.CMCD_FORMATTER_MAP = {
  /**
   * Bitrate (kbps) rounded integer
   */
  br: cml.cmcd.CMCD_FORMATTER_MAP_toRounded_,

  /**
   * Duration (milliseconds) rounded integer
   */
  d: cml.cmcd.CMCD_FORMATTER_MAP_toRounded_,

  /**
   * Buffer Length (milliseconds) rounded nearest 100ms
   */
  bl: cml.cmcd.CMCD_FORMATTER_MAP_toHundred_,

  /**
   * Deadline (milliseconds) rounded nearest 100ms
   */
  dl: cml.cmcd.CMCD_FORMATTER_MAP_toHundred_,

  /**
   * Measured Throughput (kbps) rounded nearest 100kbps
   */
  mtp: cml.cmcd.CMCD_FORMATTER_MAP_toHundred_,

  /**
   * Next Object Request URL encoded
   */
  nor: cml.cmcd.CMCD_FORMATTER_MAP_nor_,

  /**
   * Requested maximum throughput (kbps) rounded nearest 100kbps
   */
  rtp: cml.cmcd.CMCD_FORMATTER_MAP_toHundred_,

  /**
   * Top Bitrate (kbps) rounded integer
   */
  tb: cml.cmcd.CMCD_FORMATTER_MAP_toRounded_,
};
