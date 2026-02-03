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
  constructor() {
    /** @private {!Map<string, !Array<T>>} */
    this.map_ = new Map();
  }


  /**
   * Add a key, value pair to the map.
   * @param {string} key
   * @param {T} value
   */
  push(key, value) {
    if (this.map_.has(key)) {
      this.map_.get(key).push(value);
    } else {
      this.map_.set(key, [value]);
    }
  }


  /**
   * Get a list of values by key.
   * @param {string} key
   * @return {Array<T>} or null if no such key exists.
   */
  get(key) {
    if (!this.map_.has(key)) {
      return null;
    }
    // slice() clones the list so that it and the map can each be modified
    // without affecting the other.
    return this.map_.get(key).slice();
  }


  /**
   * Get a list of all values.
   * @return {!Array<T>}
   */
  getAll() {
    const list = [];
    for (const value of this.map_.values()) {
      list.push(...value);
    }
    return list;
  }


  /**
   * Remove a specific value, if it exists.
   * @param {string} key
   * @param {T} value
   */
  remove(key, value) {
    if (!this.map_.has(key)) {
      return;
    }
    const newValue = this.map_.get(key).filter((i) => i != value);
    this.map_.set(key, newValue);
    if (!newValue.length) {
      // Delete the array if it's empty, so that |get| will reliably return null
      // "if no such key exists", instead of sometimes returning an empty array.
      this.map_.delete(key);
    }
  }


  /**
   * Clear all keys and values from the multimap.
   */
  clear() {
    this.map_.clear();
  }


  /**
   * @param {function(string, !Array<T>)} callback
   */
  forEach(callback) {
    this.map_.forEach((value, key) => {
      callback(key, value);
    });
  }

  /**
   * Returns the number of elements in the multimap.
   * @return {number}
   */
  size() {
    return this.map_.size;
  }

  /**
   * Get a list of all the keys.
   * @return {!Array<string>}
   */
  keys() {
    return Array.from(this.map_.keys());
  }
};
