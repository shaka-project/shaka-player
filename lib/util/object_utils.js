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

goog.provide('shaka.util.ObjectUtils');


shaka.util.ObjectUtils = class {
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
  static cloneObject(arg) {
    let seenObjects = new Set();
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

          if (seenObjects.has(val)) {
            return null;
          }

          const isArray = val.constructor == Array;
          if (val.constructor != Object && !isArray) {
            return null;
          }

          seenObjects.add(val);
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
  }
};
