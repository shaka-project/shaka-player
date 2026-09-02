/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MapUtils');


/**
 * @summary A set of map/object utility functions.
 */
shaka.util.MapUtils = class {
  /**
   * @param {!Object<KEY, VALUE>} object
   * @return {!Map<KEY, VALUE>}
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
   * @param {!Map<KEY, VALUE>} map
   * @return {!Object<KEY, VALUE>}
   * @template KEY,VALUE
   */
  static asObject(map) {
    const obj = {};
    map.forEach((value, key) => {
      obj[key] = value;
    });

    return obj;
  }

  /**
   * NOTE: This only works for simple value types and
   * will not be accurate if map values are objects!
   *
   * @param {Map<KEY, VALUE>} map1
   * @param {Map<KEY, VALUE>} map2
   * @return {boolean}
   * @template KEY,VALUE
   */
  static hasSameElements(map1, map2) {
    if (!map1 && !map2) {
      return true;
    } else if (map1 && !map2) {
      return false;
    } else if (map2 && !map1) {
      return false;
    }

    if (map1.size != map2.size) {
      return false;
    }

    for (const [key, val] of map1) {
      if (!map2.has(key)) {
        return false;
      }

      const val2 = map2.get(key);
      if (val2 != val || (val2 == undefined)) {
        return false;
      }
    }
    return true;
  }
};
