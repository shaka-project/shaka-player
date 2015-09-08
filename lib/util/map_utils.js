/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.util.MapUtils');


/**
 * @namespace shaka.util.MapUtils
 * @summary A set of map/object utility functions.
 */


/**
 * Returns true if the map is empty; otherwise, returns false.
 *
 * @param {!Object.<string, T>} object
 * @return {boolean}
 * @template T
 */
shaka.util.MapUtils.empty = function(object) {
  return Object.keys(object).length == 0;
};


/**
 * Gets the map's values.
 *
 * @param {!Object.<string, T>} object
 * @return {!Array.<T>}
 * @template T
 */
shaka.util.MapUtils.values = function(object) {
  return Object.keys(object).map(function(key) { return object[key]; });
};


/**
 * Gets a boolean value.
 *
 * @param {!Object.<string, *>} object
 * @param {string} key
 * @return {?boolean} The value if the value exists and is a boolean value;
 *     otherwise, return null if the value does not exist.
 * @throws TypeError if the value is not a boolean value.
 */
shaka.util.MapUtils.getBoolean = function(object, key) {
  var value = shaka.util.MapUtils.getAsPrimitiveType(object, key, 'boolean');
  return /** @type {?boolean} */(value);
};


/**
 * Gets a number value.
 *
 * @param {!Object.<string, *>} object
 * @param {string} key
 * @param {number=} opt_lowerBound Optional lower bound (inclusive).
 * @param {number=} opt_upperBound Optional upper bound (inclusive).
 * @return {?number} The value if the value exists and is a number value that
 *     is finite and within the given bounds, if any; otherwise, return null if
 *     the value does not exist.
 * @throws TypeError if the value is not a number value.
 * @throws RangeError if the value is not finite or within the given bounds,
 *     if any.
 */
shaka.util.MapUtils.getNumber = function(
    object, key, opt_lowerBound, opt_upperBound) {
  var value = shaka.util.MapUtils.getAsPrimitiveType(object, key, 'number');
  if (value == null) {
    return null;
  }

  var n = /** @type {number} */(value);

  if (isNaN(n) ||
      n == Number.NEGATIVE_INFINITY ||
      n == Number.POSITIVE_INFINITY) {
    throw new RangeError('\'' + key + '\' must be finite.');
  }

  if ((opt_lowerBound != null) && n < opt_lowerBound) {
    throw new RangeError('\'' + key + '\' must be >= ' + opt_lowerBound);
  }

  if ((opt_upperBound != null) && n > opt_upperBound) {
    throw new RangeError('\'' + key + '\' must be <= ' + opt_upperBound);
  }

  return n;
};


/**
 * Gets a string value.
 *
 * @param {!Object.<string, *>} object
 * @param {string} key
 * @return {?string} The value if the value exists and is a string value;
 *     otherwise, return null if the value does not exist.
 * @throws TypeError if the value is not a string value.
 */
shaka.util.MapUtils.getString = function(object, key) {
  var value = shaka.util.MapUtils.getAsPrimitiveType(object, key, 'string');
  return /** @type {?string} */(value);
};


/**
 * Gets a value that has the specified primitive type
 *
 * @param {!Object.<string, *>} object
 * @param {string} key
 * @param {string} typeName The primitive type's name, e.g., 'boolean'.
 * @return {*} The value if the value exists and has the specified type;
 *     otherwise, return null if the value does not exist.
 * @throws TypeError if the value does not have the specified type.
 */
shaka.util.MapUtils.getAsPrimitiveType = function(
    object, key, typeName) {
  var value = object[key];
  if (value == null) {
    return null;
  }

  if (typeof value != typeName) {
    throw new TypeError('\'' + key + '\' must be a ' + typeName + '.');
  }

  return value;
};


/**
 * Gets a value that is an instance of the specified class.
 *
 * @param {!Object.<string, *>} object
 * @param {string} key
 * @param {(function(new:T)|function(new:T, ...*))} constructor The class's
 *     constructor.
 * @return {T} The value if the value exists and is an instance of the
 *     specified class; otherwise, return null if the value does not exist.
 * @throws TypeError if the value is not an instance of the specified class.
 * @template T
 */
shaka.util.MapUtils.getAsInstanceType = function(
    object, key, constructor) {
  var value = object[key];
  if (value == null) {
    return null;
  }

  if (!(value instanceof constructor)) {
    throw new TypeError(
        '\'' + key + '\' must be an instance of ' + constructor.name + '.');
  }

  return value;
};

