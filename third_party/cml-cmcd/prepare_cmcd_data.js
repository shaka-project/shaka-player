/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.prepareCmcdData');

goog.require('cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE');
goog.require('cml.cmcd.CMCD_EVENT_CUSTOM_EVENT');
goog.require('cml.cmcd.CMCD_EVENT_MODE');
goog.require('cml.cmcd.CMCD_EVENT_PLAYBACK_RATE');
goog.require('cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED');
goog.require('cml.cmcd.CMCD_FORMATTER_MAP');
goog.require('cml.cmcd.CMCD_INNER_LIST_KEYS');
goog.require('cml.cmcd.CMCD_REQUEST_MODE');
goog.require('cml.cmcd.CMCD_STATE_EVENT_FIELDS');
goog.require('cml.cmcd.CMCD_V2');
goog.require('cml.cmcd.Cmcd');
goog.require('cml.cmcd.CmcdEncodeOptions');
goog.require('cml.cmcd.CmcdFormatterOptions');
goog.require('cml.cmcd.SfItem');
goog.require('cml.cmcd.SfToken');
goog.require('cml.cmcd.isCmcdEventKey');
goog.require('cml.cmcd.isCmcdRequestKey');
goog.require('cml.cmcd.isCmcdResponseReceivedKey');
goog.require('cml.cmcd.isCmcdV1Key');
goog.require('cml.cmcd.isTokenField');
goog.require('cml.cmcd.isValid');


/**
 * Filter map: reporting mode → key-include predicate.
 *
 * @private @const {!Object<string, function(string): boolean>}
 */
cml.cmcd.prepareCmcdData_filterMap_ = {
  [cml.cmcd.CMCD_EVENT_MODE]: cml.cmcd.isCmcdEventKey,
  [cml.cmcd.CMCD_REQUEST_MODE]: cml.cmcd.isCmcdRequestKey,
};


/**
 * Unwrap an inner list or SfItem value to a plain scalar.
 *
 * @param {*} value
 * @param {string=} ot
 * @return {*}
 * @private
 */
cml.cmcd.prepareCmcdData_unwrapValue_ = function(value, ot) {
  if (Array.isArray(value)) {
    let item;

    if (ot) {
      item = value.find((it) => it && it.params && it.params.ot === ot);
    }

    if (!item) {
      item = value[0];
    }

    return cml.cmcd.prepareCmcdData_unwrapValue_(item);
  }

  if (value instanceof cml.cmcd.SfItem) {
    return value.value;
  }

  return value;
};


/**
 * Down-convert V2 CMCD data to V1 format.
 *
 * - Extracts `nrr` from `nor` SfItem `r` parameter.
 * - Unwraps inner-list values to plain scalars.
 *
 * @param {!Object<string, *>} obj
 * @return {!Object<string, *>}
 * @private
 */
cml.cmcd.prepareCmcdData_downConvertToV1_ = function(obj) {
  /** @type {!Object<string, *>} */
  const result = {};

  for (const [k, value] of Object.entries(obj)) {
    const key = /** @type {string} */ (k);
    if (value == null) {
      result[key] = value;
      continue;
    }

    if (key === 'nor') {
      const items = Array.isArray(value) ? value : [value];
      const first = items[0];

      if (first instanceof cml.cmcd.SfItem) {
        result['nor'] = first.value;
        const params =
            /** @type {?{r: (string|undefined)}} */ (first.params);
        if (params && params.r) {
          result['nrr'] = params.r;
        }
      } else {
        result['nor'] = first;
      }
    } else if (cml.cmcd.CMCD_INNER_LIST_KEYS.has(key)) {
      result[key] = cml.cmcd.prepareCmcdData_unwrapValue_(
          value, /** @type {string|undefined} */ (obj['ot']));
    } else {
      result[key] = value;
    }
  }

  return result;
};


/**
 * Convert a generic object to CMCD data.
 *
 * @param {!Object<string, *>} obj The CMCD object to process.
 * @param {cml.cmcd.CmcdEncodeOptions=} options Options for encoding.
 * @return {!cml.cmcd.Cmcd}
 */
cml.cmcd.prepareCmcdData = function(obj, options) {
  /** @type {!cml.cmcd.CmcdEncodeOptions} */
  const opts = /** @type {!cml.cmcd.CmcdEncodeOptions} */ (options || {});

  /** @type {!Object<string, *>} */
  const results = {};

  if (obj == null || typeof obj !== 'object') {
    return /** @type {!cml.cmcd.Cmcd} */ (results);
  }

  const version = opts.version ||
      /** @type {number} */ (obj['v']) || cml.cmcd.CMCD_V2;
  const reportingMode = opts.reportingMode || cml.cmcd.CMCD_REQUEST_MODE;

  // Down-convert V2 data to V1 format if needed
  const data = version === 1 ?
      cml.cmcd.prepareCmcdData_downConvertToV1_(obj) : obj;

  const keyFilter = version === 1 ?
      cml.cmcd.isCmcdV1Key :
      cml.cmcd.prepareCmcdData_filterMap_[reportingMode];

  // Filter keys based on the version, reporting mode and options
  let keys = Object.keys(data).filter(keyFilter);

  if (data['e'] && data['e'] !== cml.cmcd.CMCD_EVENT_RESPONSE_RECEIVED) {
    keys = keys.filter((key) => !cml.cmcd.isCmcdResponseReceivedKey(key));
  }

  const filter = opts.filter;
  if (typeof filter === 'function') {
    keys = keys.filter(filter);
  }

  // Ensure all required event keys are present before sorting
  const isEventMode = reportingMode === cml.cmcd.CMCD_EVENT_MODE;

  if (isEventMode) {
    const eventType = data['e'];

    if (!keys.includes('e') && eventType != null) {
      keys.push('e');
    }

    if (!keys.includes('ts')) {
      keys.push('ts');
    }

    if (!keys.includes('cen') && data['cen'] != null &&
        eventType === cml.cmcd.CMCD_EVENT_CUSTOM_EVENT) {
      keys.push('cen');
    }

    const requiredField = eventType ?
        cml.cmcd.CMCD_STATE_EVENT_FIELDS.get(
            /** @type {string} */ (eventType)) :
        undefined;
    if (requiredField && data[requiredField] != null &&
        !keys.includes(requiredField)) {
      keys.push(requiredField);
    }
  }

  if (keys.length === 0) {
    return /** @type {!cml.cmcd.Cmcd} */ (results);
  }

  if (version > 1 && !keys.includes('v')) {
    keys.push('v');
  }

  /** @type {!cml.cmcd.CmcdFormatterOptions} */
  const formatterOptions = {
    version: version,
    reportingMode: reportingMode,
    baseUrl: opts.baseUrl,
  };

  keys.sort();

  for (const key of keys) {
    let value = data[key];

    const formatter = (opts.formatters && opts.formatters[key]) ||
        cml.cmcd.CMCD_FORMATTER_MAP[key];
    if (typeof formatter === 'function') {
      value = formatter(value, formatterOptions);
    }

    // Version should only be reported if not equal to 1.
    if (key === 'v') {
      if (version === 1) {
        continue;
      } else {
        value = version;
      }
    }

    // Playback rate should only be sent if not equal to 1, except as
    // the value of a PLAYBACK_RATE state-change event (where pr=1 is
    // the data being reported, not a default to skip).
    if (key === 'pr' && value === 1 &&
        !(isEventMode && data['e'] === cml.cmcd.CMCD_EVENT_PLAYBACK_RATE)) {
      continue;
    }

    // Ensure a timestamp is set for event mode
    if (isEventMode && key === 'ts' && !Number.isFinite(value)) {
      value = Date.now();
    }

    // Ignore invalid values, except `bg: false` on a backgrounded-mode
    // (e=b) state-change event — the wire must carry `?0` per
    // CTA-5004-B so the transition is reportable. `bg` is the only
    // state-change required field typed as boolean.
    const isBgFalseTransition = isEventMode &&
        value === false &&
        key === 'bg' &&
        data['e'] === cml.cmcd.CMCD_EVENT_BACKGROUNDED_MODE;
    if (!cml.cmcd.isValid(value) && !isBgFalseTransition) {
      continue;
    }

    if (cml.cmcd.isTokenField(key) && typeof value === 'string') {
      value = new cml.cmcd.SfToken(value);
    }

    results[key] = value;
  }

  return /** @type {!cml.cmcd.Cmcd} */ (results);
};
