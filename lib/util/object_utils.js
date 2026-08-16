/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ObjectUtils');


/** @export */
shaka.util.ObjectUtils = class {
  /**
   * Performs a deep clone of the given simple object.  This does not copy
   * prototypes, custom properties (e.g. read-only), or multiple references to
   * the same object.  If the caller needs these fields, it will need to set
   * them after this returns.
   *
   * @template T
   * @param {T} arg
   * @return {T}
   * @export
   */
  static cloneObject(arg) {
    const seenObjects = new WeakSet();
    // This recursively clones the value |val|, using the captured variable
    // |seenObjects| to track the objects we have already cloned.
    /**
     * @param {*} val
     * @return {*}
     * @suppress {strictMissingProperties}
     */
    const clone = (val) => {
      switch (typeof val) {
        case 'undefined':
        case 'boolean':
        case 'number':
        case 'string':
        case 'symbol':
        case 'function':
          return val;
        case 'object':
        default: {
          // typeof null === 'object'
          if (!val) {
            return val;
          }

          // This covers Uint8Array and friends, even without a TypedArray
          // base-class constructor.
          const isTypedArray = ArrayBuffer.isView(val);
          if (isTypedArray) {
            return val;
          }

          if (seenObjects.has(val)) {
            return null;
          }

          const isArray = Array.isArray(val);
          if (val.constructor != Object && !isArray) {
            return null;
          }

          seenObjects.add(val);
          const ret = isArray ? [] : {};
          // Note |name| will equal a number for arrays.
          for (const name in val) {
            ret[name] = clone(val[name]);
          }

          // Length is a non-enumerable property, but we should copy it over in
          // case it is not the default.
          if (isArray) {
            ret.length = val.length;
          }
          return ret;
        }
      }
    };
    return clone(arg);
  }

  /**
   * Performs a shallow clone of the given simple object.  This does not copy
   * prototypes or custom properties (e.g. read-only).
   *
   * @template T
   * @param {T} original
   * @return {T}
   * @export
   */
  static shallowCloneObject(original) {
    const clone = /** @type {?} */({});
    for (const k in original) {
      clone[k] = original[k];
    }
    return clone;
  }


  /**
   * Constructs a string out of a value, similar to the JSON.stringify method.
   * Unlike that method, this guarantees that the order of the keys in an
   * object is alphabetical, so it can be used as a way to reliably compare two
   * objects.
   *
   * @param {?} value
   * @return {string}
   * @export
   */
  static alphabeticalKeyOrderStringify(value) {
    if (Array.isArray(value)) {
      return shaka.util.ObjectUtils.arrayStringify_(value);
    } else if (typeof value == 'function') {
      // For safety, skip functions.  For function x,
      // x.prototype.constructor.prototype === x.prototype, so all functions
      // contain circular references if treated like Objects.
      return '';
    } else if (value instanceof Object) {
      return shaka.util.ObjectUtils.objectStringify_(value);
    } else {
      return JSON.stringify(value);
    }
  }


  /**
   * Helper for alphabeticalKeyOrderStringify for objects.
   *
   * @param {!Object} obj
   * @return {string}
   * @private
   */
  static objectStringify_(obj) {
    // NOTE: This excludes prototype chain keys.  For now, this is intended for
    // anonymous objects only, so we don't care.  If that changes, go back to a
    // for-in loop.
    const keys = Object.keys(obj);
    // Alphabetically sort the keys, so they will be in a reliable order.
    keys.sort();

    const terms = [];
    for (const key of keys) {
      const escapedKey = JSON.stringify(key);
      const value = obj[key];
      if (value !== undefined) {
        const escapedValue =
            shaka.util.ObjectUtils.alphabeticalKeyOrderStringify(value);
        if (escapedValue) {
          terms.push(escapedKey + ':' + escapedValue);
        }
      }
    }
    return '{' + terms.join(',') + '}';
  }


  /**
   * Helper for alphabeticalKeyOrderStringify for arrays.
   *
   * This could itself be JSON.stringify, except we want objects within the
   * array to go through our own stringifiers.
   *
   * @param {!Array} arr
   * @return {string}
   * @private
   */
  static arrayStringify_(arr) {
    const terms = [];
    for (let index = 0; index < arr.length; index++) {
      const escapedKey = index.toString();
      const value = arr[index];
      if (value !== undefined) {
        const escapedValue =
            shaka.util.ObjectUtils.alphabeticalKeyOrderStringify(value);
        if (escapedValue) {
          terms.push(escapedKey + ':' + escapedValue);
        }
      }
    }
    return '[' + terms.join(',') + ']';
  }
};
