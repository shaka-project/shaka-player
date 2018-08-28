/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.util.ConfigUtils');

goog.require('goog.asserts');
goog.require('shaka.log');


/**
 * @param {!Object} destination
 * @param {!Object} source
 * @param {!Object} template supplies default values
 * @param {!Object} overrides
 *   Supplies override type checking.  When the current path matches the key in
 *   this object, each sub-value must match the type in this object.  If this
 *   contains an Object, it is used as the template.
 * @param {string} path to this part of the config
 * @return {boolean}
 */
shaka.util.ConfigUtils.mergeConfigObjects =
    function(destination, source, template, overrides, path) {
  goog.asserts.assert(destination, 'Destination config must not be null!');

  /**
   * @type {boolean}
   * If true, don't validate the keys in the next level.
   */
  let ignoreKeys = path in overrides;

  let isValid = true;

  for (let k in source) {
    let subPath = path + '.' + k;
    let subTemplate = ignoreKeys ? overrides[path] : template[k];

    // The order of these checks is important.
    if (!ignoreKeys && !(k in destination)) {
      shaka.log.error('Invalid config, unrecognized key ' + subPath);
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
        destination[k] = shaka.util.ConfigUtils.cloneObject(subTemplate);
      }
    } else if (subTemplate.constructor == Object &&
               source[k] &&
               source[k].constructor == Object) {
      // These are plain Objects with no other constructor.

      if (!destination[k]) {
        // The only way we should see a null destination is when ignoreKeys is
        // true, so assert that it is.
        goog.asserts.assert(ignoreKeys, 'Null destination without ignoreKeys!');
        // Initialize the destination with the template so that normal merging
        // and type-checking can happen.
        destination[k] = shaka.util.ConfigUtils.cloneObject(subTemplate);
      }

      let subMergeValid = shaka.util.ConfigUtils.mergeConfigObjects(
          destination[k], source[k], subTemplate, overrides, subPath);
      isValid = isValid && subMergeValid;
    } else if (typeof source[k] != typeof subTemplate ||
               source[k] == null ||
               source[k].constructor != subTemplate.constructor) {
      // The source is the wrong type.  This check allows objects to be nulled,
      // but does not allow null for any non-object fields.
      shaka.log.error('Invalid config, wrong type for ' + subPath);
      isValid = false;
    } else if (typeof destination[k] == 'function' &&
               destination[k].length != source[k].length) {
      shaka.log.warning(
          'Invalid config, wrong number of arguments for ' + subPath);
      destination[k] = source[k];
    } else {
      destination[k] = source[k];
    }
  }

  return isValid;
};


/**
 * Performs a deep clone of the given simple object.  This does not copy
 * prototypes, custom properties (e.g. read-only), or multiple references to
 * the same object.  If the caller needs these fields, it will need to set them
 * after this returns.
 *
 * @template T
 * @param {T} arg
 * @return {T}
 */
shaka.util.ConfigUtils.cloneObject = function(arg) {
  let seenObjects = [];
  // This recursively clones the value |val|, using the captured variable
  // |seenObjects| to track the objects we have already cloned.
  let clone = function(val) {
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
        if (!val) return val;

        // This covers Uint8Array and friends, even without a TypedArray
        // base-class constructor.
        const isTypedArray =
            val.buffer && val.buffer.constructor == ArrayBuffer;
        if (isTypedArray) {
          return val;
        }

        if (seenObjects.indexOf(val) >= 0) {
          return null;
        }

        const isArray = val.constructor == Array;
        if (val.constructor != Object && !isArray) {
          return null;
        }

        seenObjects.push(val);
        let ret = isArray ? [] : {};
        // Note |name| will equal a number for arrays.
        for (let name in val) {
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
};
