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

goog.provide('shaka.offline.memory.StorageTable');

goog.require('shaka.util.MapUtils');



/**
 * @template T
 */
shaka.offline.memory.StorageTable = class {
  constructor() {
    /** @private {!Object.<number, !T>} */
    this.values_ = {};
  }


  /**
   * Make a shallow copy of the internal map.
   *
   * @return {!Object.<number, !T>}
   */
  all() {
    /** @type {!Object.<number, !T>}*/
    let map = {};

    shaka.util.MapUtils.forEach(this.values_, (key, value) => {
      map[key] = value;
    });

    return map;
  }


  /**
   * @param {number} count
   * @return {!Array.<number>}
   */
  getKeys(count) {
    /** @type {number} */
    let maxKey = 0;

    shaka.util.MapUtils.forEach(this.values_, (key, value) => {
      maxKey = Math.max(maxKey, key);
    });

    let keys = [];

    for (let i = 0; i < count; i++) {
      keys.push(maxKey + 1 + i);
    }

    return keys;
  }


  /**
   * @param {number} key
   * @param {!T} value
   */
  set(key, value) {
    this.values_[key] = value;
  }


  /**
   * @param {!Array.<number>} keys
   * @return {!Object.<number, !T>}
   */
  get(keys) {
    /** @type {!Object.<number, !T>} */
    let map = {};

    keys.forEach((key) => {
      let value = this.values_[key];
      if (value) {
        map[key] = value;
      }
    });

    return map;
  }


  /**
   * @param {!Array.<number>} keys
   */
  remove(keys) {
    keys.forEach((key) => {
      delete this.values_[key];
    });
  }


  /**
   * Clear all the values out of the internal table.
   */
  clear() {
    this.values_ = {};
  }
};
