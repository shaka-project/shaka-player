/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.MultiMap');


/**
 * @summary A simple multimap template.
 * @template T
 */
shaka.util.MultiMap = class {
  /** */
  constructor() {
    /** @private {!Object.<string, !Array.<T>>} */
    this.map_ = {};
  }


  /**
   * Add a key, value pair to the map.
   * @param {string} key
   * @param {T} value
   */
  push(key, value) {
    // eslint-disable-next-line no-prototype-builtins
    if (this.map_.hasOwnProperty(key)) {
      this.map_[key].push(value);
    } else {
      this.map_[key] = [value];
    }
  }


  /**
   * Get a list of values by key.
   * @param {string} key
   * @return {Array.<T>} or null if no such key exists.
   */
  get(key) {
    const list = this.map_[key];
    // slice() clones the list so that it and the map can each be modified
    // without affecting the other.
    return list ? list.slice() : null;
  }


  /**
   * Get a list of all values.
   * @return {!Array.<T>}
   */
  getAll() {
    const list = [];
    for (const key in this.map_) {
      list.push(...this.map_[key]);
    }
    return list;
  }


  /**
   * Remove a specific value, if it exists.
   * @param {string} key
   * @param {T} value
   */
  remove(key, value) {
    if (!(key in this.map_)) {
      return;
    }
    this.map_[key] = this.map_[key].filter((i) => i != value);
    if (this.map_[key].length == 0) {
      // Delete the array if it's empty, so that |get| will reliably return null
      // "if no such key exists", instead of sometimes returning an empty array.
      delete this.map_[key];
    }
  }


  /**
   * Clear all keys and values from the multimap.
   */
  clear() {
    this.map_ = {};
  }


  /**
   * @param {function(string, !Array.<T>)} callback
   */
  forEach(callback) {
    for (const key in this.map_) {
      callback(key, this.map_[key]);
    }
  }

  /**
   * Returns the number of elements in the multimap.
   * @return {number}
   */
  size() {
    return Object.keys(this.map_).length;
  }

  /**
   * Get a list of all the keys.
   * @return {!Array.<string>}
   */
  keys() {
    return Object.keys(this.map_);
  }
};
