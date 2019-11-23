/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MapUtils');


/**
 * @summary A set of map/object utility functions.
 */
shaka.util.MapUtils = class {
  /**
   * @param {!Object.<KEY, VALUE>} object
   * @return {!Map.<KEY, VALUE>}
   * @template KEY,VALUE
   */
  static asMap(object) {
    const map = new Map();
    for (const key of Object.keys(object)) {
      map.set(key, object[key]);
    }

    return map;
  }


  /**
   * @param {!Map.<KEY, VALUE>} map
   * @return {!Object.<KEY, VALUE>}
   * @template KEY,VALUE
   */
  static asObject(map) {
    const obj = {};
    map.forEach((value, key) => {
      obj[key] = value;
    });

    return obj;
  }
};
