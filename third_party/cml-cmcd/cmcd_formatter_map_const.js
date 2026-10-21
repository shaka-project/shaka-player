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
 * Resolves the base for `nor` relativization, or `undefined` when
 * `baseUrl` is absent or not a valid absolute URL (for example a relative
 * request URL), in which case `nor` values are emitted unchanged.
 *
 * LOCAL MOD: backport of the invalid-`baseUrl` guard from upstream
 * cmcd-v2.8.0 (`toBase()` in `formatNor.ts`). In 2.4.0 a relative
 * `baseUrl` made `getBaseUrl()` throw `Invalid URL`.
 *
 * @param {(string|undefined)} baseUrl
 * @return {(string|undefined)}
 * @private
 */
cml.cmcd.CMCD_FORMATTER_MAP_toBase_ = function(baseUrl) {
  if (!baseUrl) {
    return undefined;
  }

  try {
    return new URL(cml.cmcd.getBaseUrl(baseUrl)).href;
  } catch (e) {
    return undefined;
  }
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
    const base = cml.cmcd.CMCD_FORMATTER_MAP_toBase_(options.baseUrl);
    if (base) {
      value = cml.cmcd.urlToRelativePath(
          /** @type {string} */ (value), base);
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
