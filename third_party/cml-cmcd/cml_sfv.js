/*! @license
 * Copyright 2024 Streaming Video Technology Alliance
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('cml.cmcd.SfItem');
goog.provide('cml.cmcd.SfToken');
goog.provide('cml.cmcd.encodeSfDict');


/**
 * Vendored shim of the `@svta/cml-structured-field-values` surface used
 * by the CMCD encoders. Provides the two runtime classes (`SfItem`,
 * `SfToken`) and the dictionary serializer (`encodeSfDict`).
 *
 * Upstream CMCD imports:
 *
 * - `SfItem`/`SfToken` (constructors, `value`/`params`/`description`
 *   property access) — used by `prepareCmcdData`, `CMCD_FORMATTER_MAP`,
 *   `toCmcdValue`.
 * - `encodeSfDict` — the entire CMCD wire output runs through this.
 *   Used by `encodePreparedCmcd` and `toPreparedCmcdHeaders`.
 *
 * The serializer is RFC 8941 (HTTP Structured Field Values) §4.1
 * encoding; we vendor it because without it no encoder file can produce
 * wire output. The transitive surface is small and kept verbatim to
 * upstream so per-bump diffs stay stable.
 *
 * Decoding (`decodeSfDict` etc.) is not needed by the CMCD encoders and
 * is not vendored.
 */


/**
 * Structured Field Item.
 */
cml.cmcd.SfItem = class {
  /**
   * @param {*} value The value of the item.
   * @param {*=} params The parameters of the item.
   */
  constructor(value, params) {
    if (Array.isArray(value)) {
      value = value.map(
          (v) => (v instanceof cml.cmcd.SfItem) ? v : new cml.cmcd.SfItem(v));
    }

    /** @type {*} */
    this.value = value;

    /** @type {*} */
    this.params = params;
  }
};


/**
 * A class to represent structured field tokens when `Symbol` is not
 * available.
 */
cml.cmcd.SfToken = class {
  /**
   * @param {string} description
   */
  constructor(description) {
    /** @type {string} */
    this.description = description;
  }
};


/**
 * Converts a symbol or SfToken to a string.
 *
 * @param {symbol|!cml.cmcd.SfToken} symbol
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_symbolToStr_ = function(symbol) {
  return symbol.description || symbol.toString().slice(7, -1);
};


/**
 * @param {*} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_format_ = function(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }
  if (value instanceof Map) {
    return 'Map{}';
  }
  if (value instanceof Set) {
    return 'Set{}';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
};


/**
 * @param {string} action
 * @param {*} src
 * @param {string} type
 * @param {*=} cause
 * @return {!Error}
 * @private
 */
cml.cmcd.SfvImpl_throwError_ = function(action, src, type, cause) {
  return new Error(
      `failed to ${action} "${cml.cmcd.SfvImpl_format_(src)}" as ${type}`,
      {cause});
};


/**
 * @param {*} src
 * @param {string} type
 * @param {*=} cause
 * @return {!Error}
 * @private
 */
cml.cmcd.SfvImpl_serializeError_ = function(src, type, cause) {
  return cml.cmcd.SfvImpl_throwError_('serialize', src, type, cause);
};


/**
 * Encodes binary data to base64.
 *
 * @param {!Uint8Array} binary
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_encodeBase64_ = function(binary) {
  return btoa(String.fromCharCode(...binary));
};


/**
 * Banker's rounding to a given number of decimal places.
 *
 * @param {number} value
 * @param {number} precision
 * @return {number}
 * @private
 */
cml.cmcd.SfvImpl_roundToEven_ = function(value, precision) {
  if (value < 0) {
    return -cml.cmcd.SfvImpl_roundToEven_(-value, precision);
  }

  const decimalShift = Math.pow(10, precision);
  const isEquidistant = Math.abs(((value * decimalShift) % 1) - 0.5) <
      Number.EPSILON;

  if (isEquidistant) {
    const flooredValue = Math.floor(value * decimalShift);
    return (flooredValue % 2 === 0 ? flooredValue : flooredValue + 1) /
        decimalShift;
  } else {
    return Math.round(value * decimalShift) / decimalShift;
  }
};


/**
 * @param {number} value
 * @return {boolean}
 * @private
 */
cml.cmcd.SfvImpl_isInvalidInt_ = function(value) {
  return value < -999999999999999 || 999999999999999 < value;
};


/**
 * Serialize a Boolean per RFC 8941 §4.1.9.
 *
 * @param {boolean} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeBoolean_ = function(value) {
  if (typeof value !== 'boolean') {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Boolean');
  }
  return value ? '?1' : '?0';
};


/**
 * Serialize a Byte Sequence per RFC 8941 §4.1.8.
 *
 * @param {!Uint8Array} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeByteSequence_ = function(value) {
  if (ArrayBuffer.isView(value) === false) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Byte Sequence');
  }
  return `:${cml.cmcd.SfvImpl_encodeBase64_(value)}:`;
};


/**
 * Serialize an Integer per RFC 8941 §4.1.4.
 *
 * @param {number} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeInteger_ = function(value) {
  if (cml.cmcd.SfvImpl_isInvalidInt_(value)) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Integer');
  }
  return value.toString();
};


/**
 * Serialize a Date per RFC 8941 §4.1.10.
 *
 * @param {!Date} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeDate_ = function(value) {
  return `@${cml.cmcd.SfvImpl_serializeInteger_(value.getTime() / 1000)}`;
};


/**
 * Serialize a Decimal per RFC 8941 §4.1.5.
 *
 * @param {number} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeDecimal_ = function(value) {
  // round to 3 decimal places
  const roundedValue = cml.cmcd.SfvImpl_roundToEven_(value, 3);
  if (Math.floor(Math.abs(roundedValue)).toString().length > 12) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Decimal');
  }
  const stringValue = roundedValue.toString();
  return stringValue.includes('.') ? stringValue : `${stringValue}.0`;
};


// eslint-disable-next-line no-control-regex
cml.cmcd.SfvImpl_STRING_REGEX_ = /[\x00-\x1f\x7f]+/;


/**
 * Serialize a String per RFC 8941 §4.1.6.
 *
 * @param {string} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeString_ = function(value) {
  if (cml.cmcd.SfvImpl_STRING_REGEX_.test(value)) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'String');
  }

  return `"${value.replace(/\\/g, `\\\\`).replace(/"/g, `\\"`)}"`;
};


/**
 * Serialize a Token per RFC 8941 §4.1.7.
 *
 * @param {symbol|!cml.cmcd.SfToken} token
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeToken_ = function(token) {
  const value = cml.cmcd.SfvImpl_symbolToStr_(token);
  if (/^([a-zA-Z*])([!#$%&'*+\-.^_`|~\w:/]*)$/.test(value) === false) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Token');
  }
  return value;
};


/**
 * Serialize a Bare Item per RFC 8941 §4.1.3.1.
 *
 * @param {*} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeBareItem_ = function(value) {
  switch (typeof value) {
    case 'number':
      if (!Number.isFinite(value)) {
        throw cml.cmcd.SfvImpl_serializeError_(value, 'Bare Item');
      }

      if (Number.isInteger(value)) {
        return cml.cmcd.SfvImpl_serializeInteger_(value);
      }
      return cml.cmcd.SfvImpl_serializeDecimal_(value);

    case 'string':
      return cml.cmcd.SfvImpl_serializeString_(value);

    case 'symbol':
      return cml.cmcd.SfvImpl_serializeToken_(value);

    case 'boolean':
      return cml.cmcd.SfvImpl_serializeBoolean_(value);

    case 'object':
      if (value instanceof Date) {
        return cml.cmcd.SfvImpl_serializeDate_(value);
      }
      if (value instanceof Uint8Array) {
        return cml.cmcd.SfvImpl_serializeByteSequence_(value);
      }
      if (value instanceof cml.cmcd.SfToken) {
        return cml.cmcd.SfvImpl_serializeToken_(value);
      }

    // eslint-disable-next-line no-fallthrough
    default:
      // fail
      throw cml.cmcd.SfvImpl_serializeError_(value, 'Bare Item');
  }
};


/**
 * Serialize a Key per RFC 8941 §4.1.1.3.
 *
 * @param {string} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeKey_ = function(value) {
  if (/^[a-z*][a-z0-9\-_.*]*$/.test(value) === false) {
    throw cml.cmcd.SfvImpl_serializeError_(value, 'Key');
  }
  return value;
};


/**
 * Serialize Parameters per RFC 8941 §4.1.1.2.
 *
 * @param {*=} params
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeParams_ = function(params) {
  if (params == null) {
    return '';
  }

  return Object.entries(/** @type {!Object<?,?>} */ (params))
      .map(([key, value]) => {
        if (value === true) {
          // omit true
          return `;${cml.cmcd.SfvImpl_serializeKey_(/** @type {string} */ (key))}`;
        }

        return `;${cml.cmcd.SfvImpl_serializeKey_(/** @type {string} */ (key))}=` +
            `${cml.cmcd.SfvImpl_serializeBareItem_(value)}`;
      })
      .join('');
};


/**
 * Serialize an Item per RFC 8941 §4.1.3.
 *
 * @param {*} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeItem_ = function(value) {
  if (value instanceof cml.cmcd.SfItem) {
    return `${cml.cmcd.SfvImpl_serializeBareItem_(value.value)}` +
        `${cml.cmcd.SfvImpl_serializeParams_(value.params)}`;
  } else {
    return cml.cmcd.SfvImpl_serializeBareItem_(value);
  }
};


/**
 * Serialize an Inner List per RFC 8941 §4.1.1.1.
 *
 * @param {*} value
 * @return {string}
 * @private
 */
cml.cmcd.SfvImpl_serializeInnerList_ = function(value) {
  const inner = /** @type {{value: !Array<*>, params: *}} */ (value);
  return `(${inner.value.map(cml.cmcd.SfvImpl_serializeItem_).join(' ')})` +
      `${cml.cmcd.SfvImpl_serializeParams_(inner.params)}`;
};


/**
 * Encode an object into a structured field dictionary per RFC 8941 §4.1.2.
 *
 * @param {!Object|!Map} dict The structured field dictionary to encode.
 * @param {{whitespace: (boolean|undefined)}=} options Encoding options.
 * @return {string} The structured field string.
 */
cml.cmcd.encodeSfDict = function(dict, options = {whitespace: true}) {
  if (typeof dict !== 'object' || dict == null) {
    throw cml.cmcd.SfvImpl_serializeError_(dict, 'Dict');
  }

  const entries = dict instanceof Map ? dict.entries() : Object.entries(dict);
  const optionalWhiteSpace = options.whitespace ? ' ' : '';

  return Array.from(entries)
      .map(([key, item]) => {
        if (item instanceof cml.cmcd.SfItem === false) {
          item = new cml.cmcd.SfItem(item);
        }
        let output = cml.cmcd.SfvImpl_serializeKey_(key);
        if (item.value === true) {
          output += cml.cmcd.SfvImpl_serializeParams_(item.params);
        } else {
          output += '=';
          if (Array.isArray(item.value)) {
            output += cml.cmcd.SfvImpl_serializeInnerList_(item);
          } else {
            output += cml.cmcd.SfvImpl_serializeItem_(item);
          }
        }
        return output;
      })
      .join(`,${optionalWhiteSpace}`);
};
