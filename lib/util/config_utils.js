/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.ConfigUtils');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.ObjectUtils');


/** @export */
shaka.util.ConfigUtils = class {
  /**
   * @param {!Object} destination
   * @param {!Object} source
   * @param {!Object} template supplies default values
   * @param {!Object} overrides
   *   Supplies override type checking.  When the current path matches
   *   the key in this object, each sub-value must match the type in this
   *   object. If this contains an Object, it is used as the template.
   * @param {string} path to this part of the config
   * @return {boolean}
   * @export
   */
  static mergeConfigObjects(destination, source, template, overrides, path) {
    goog.asserts.assert(destination, 'Destination config must not be null!');

    // If true, override the template.
    const overrideTemplate = path in overrides;

    // If true, treat the source as a generic object to be copied without
    // descending more deeply.
    let genericObject = false;
    if (overrideTemplate) {
      genericObject = template.constructor == Object &&
        Object.keys(overrides).length == 0;
    } else {
      genericObject = template.constructor == Object &&
        Object.keys(template).length == 0;
    }

    // If true, don't validate the keys in the next level.
    const ignoreKeys = overrideTemplate || genericObject;

    let isValid = true;

    for (const k in source) {
      const subPath = path + '.' + k;
      const subTemplate = overrideTemplate ? overrides[path] : template[k];

      // The order of these checks is important.
      if (!ignoreKeys && !(k in template)) {
        shaka.log.alwaysError('Invalid config, unrecognized key ' + subPath);
        isValid = false;
      } else if (source[k] === undefined) {
        // An explicit 'undefined' value causes the key to be deleted from the
        // destination config and replaced with a default from the template if
        // possible.
        if (subTemplate === undefined || ignoreKeys) {
          // There is nothing in the template, so delete.
          delete destination[k];
        } else {
          // There is something in the template, so go back to that.
          destination[k] = shaka.util.ObjectUtils.cloneObject(subTemplate);
        }
      } else if (genericObject) {
        // Copy the fields of a generic object directly without a template and
        // without descending any deeper.
        destination[k] = source[k];
      } else if (subTemplate.constructor == Object &&
                 source[k] &&
                 source[k].constructor == Object) {
        // These are plain Objects with no other constructor.

        if (!destination[k]) {
          // Initialize the destination with the template so that normal
          // merging and type-checking can happen.
          destination[k] = shaka.util.ObjectUtils.cloneObject(subTemplate);
        }

        const subMergeValid = shaka.util.ConfigUtils.mergeConfigObjects(
            destination[k], source[k], subTemplate, overrides, subPath);
        isValid = isValid && subMergeValid;
      } else if (typeof source[k] != typeof subTemplate ||
                 source[k] == null ||
                 // Function constructors are not informative, and differ
                 // between sync and async functions.  So don't look at
                 // constructor for function types.
                 (typeof source[k] != 'function' &&
                  source[k].constructor != subTemplate.constructor)) {
        // The source is the wrong type.  This check allows objects to be
        // nulled, but does not allow null for any non-object fields.
        shaka.log.alwaysError('Invalid config, wrong type for ' + subPath);
        isValid = false;
      } else if (typeof template[k] == 'function' &&
                 template[k].length != source[k].length) {
        shaka.log.alwaysWarn(
            'Unexpected number of arguments for ' + subPath);
        destination[k] = source[k];
      } else if (Array.isArray(destination[k])) {
        // Make a copy of the input array, so that changes to the source object
        // don't immediately affect the running config.
        // Since everything here is very loosely-typed, use a cast to convince
        // the compiler we're not calling slice() on a potential ArrayBuffer,
        // which would break Tizen.
        destination[k] = /** @type {Array} */(source[k]).slice();
      } else {
        destination[k] = source[k];
      }
    }

    return isValid;
  }


  /**
   * Convert config from ('fieldName', value) format to a partial config object.
   *
   * E. g. from ('manifest.retryParameters.maxAttempts', 1) to
   * { manifest: { retryParameters: { maxAttempts: 1 }}}.
   *
   * @param {string} fieldName
   * @param {*} value
   * @return {!Object}
   * @export
   */
  static convertToConfigObject(fieldName, value) {
    const configObject = {};
    let last = configObject;
    let searchIndex = 0;
    let nameStart = 0;
    while (true) {
      const idx = fieldName.indexOf('.', searchIndex);
      if (idx < 0) {
        break;
      }
      if (idx == 0 || fieldName[idx - 1] != '\\') {
        const part = fieldName.substring(nameStart, idx).replace(/\\\./g, '.');
        last[part] = {};
        last = last[part];
        nameStart = idx + 1;
      }
      searchIndex = idx + 1;
    }

    last[fieldName.substring(nameStart).replace(/\\\./g, '.')] = value;
    return configObject;
  }

  /**
   * Reference the input parameters so the compiler doesn't remove them from
   * the calling function.  Return whatever value is specified.
   *
   * This allows an empty or default implementation of a config callback that
   * still bears the complete function signature even in compiled mode.
   *
   * The caller should look something like this:
   *
   *   const callback = (a, b, c, d) => {
   *     return referenceParametersAndReturn(
             [a, b, c, d],
             a);  // Can be anything, doesn't need to be one of the parameters
   *   };
   *
   * @param {!Array<?>} parameters
   * @param {T} returnValue
   * @return {T}
   * @template T
   * @noinline
   */
  static referenceParametersAndReturn(parameters, returnValue) {
    return parameters && returnValue;
  }

  /**
   * @param {!Object} object
   * @param {!Object} base
   * @return {!Object}
   * @export
   */
  static getDifferenceFromConfigObjects(object, base) {
    const isObject = (obj) => {
      return obj && typeof obj === 'object' && !Array.isArray(obj);
    };

    const isArrayEmpty = (array) => {
      return Array.isArray(array) && array.length === 0;
    };

    const changes = (object, base) => {
      return Object.keys(object).reduce((acc, key) => {
        const value = object[key];
        // eslint-disable-next-line no-prototype-builtins
        if (!base.hasOwnProperty(key)) {
          acc[key] = value;
        } else if (value instanceof HTMLElement &&
          base[key] instanceof HTMLElement) {
          if (!value.isEqualNode(base[key])) {
            acc[key] = value;
          }
        } else if (isObject(value) && isObject(base[key])) {
          const diff = changes(value, base[key]);
          if (Object.keys(diff).length > 0 || !isObject(diff)) {
            acc[key] = diff;
          }
        } else if (Array.isArray(value) && Array.isArray(base[key])) {
          if (!shaka.util.ArrayUtils.hasSameElements(value, base[key])) {
            acc[key] = value;
          }
        } else if (Number.isNaN(value) && Number.isNaN(base[key])) {
          // Do nothing if both are NaN
        } else if (value !== base[key]) {
          acc[key] = value;
        }
        return acc;
      }, {});
    };

    const diff = changes(object, base);

    const removeEmpty = (obj) => {
      for (const key of Object.keys(obj)) {
        if (obj[key] instanceof HTMLElement) {
          // Do nothing if it's a HTMLElement
        } else if (isObject(obj[key]) && Object.keys(obj[key]).length === 0) {
          delete obj[key];
        } else if (isArrayEmpty(obj[key])) {
          delete obj[key];
        } else if (typeof obj[key] == 'function') {
          delete obj[key];
        } else if (isObject(obj[key])) {
          removeEmpty(obj[key]);
          if (Object.keys(obj[key]).length === 0) {
            delete obj[key];
          }
        }
      }
    };

    removeEmpty(diff);
    return diff;
  }
};
