/**
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
 *
 * @fileoverview Map utility functions.
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

