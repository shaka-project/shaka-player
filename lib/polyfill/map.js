/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Map');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide Map.prototype.getOrInsert,
 * Map.prototype.getOrInsertComputed, WeakMap.prototype.getOrInsert,
 * and WeakMap.prototype.getOrInsertComputed methods.
 * @see https://github.com/tc39/proposal-upsert
 * @export
 */
shaka.polyfill.Map = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('Map.install');

    // eslint-disable-next-line no-restricted-syntax
    if (!('getOrInsert' in Map.prototype)) {
      shaka.log.debug('Map: Installing getOrInsert polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      Map.prototype.getOrInsert = shaka.polyfill.Map.mapGetOrInsert_;
    }

    // eslint-disable-next-line no-restricted-syntax
    if (!('getOrInsertComputed' in Map.prototype)) {
      shaka.log.debug('Map: Installing getOrInsertComputed polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      Map.prototype.getOrInsertComputed =
        shaka.polyfill.Map.mapGetOrInsertComputed_;
    }

    shaka.log.debug('WeakMap.install');

    // eslint-disable-next-line no-restricted-syntax
    if (!('getOrInsert' in WeakMap.prototype)) {
      shaka.log.debug('WeakMap: Installing getOrInsert polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      WeakMap.prototype.getOrInsert = shaka.polyfill.Map.mapGetOrInsert_;
    }

    // eslint-disable-next-line no-restricted-syntax
    if (!('getOrInsertComputed' in WeakMap.prototype)) {
      shaka.log.debug('WeakMap: Installing getOrInsertComputed polyfill.');
      // eslint-disable-next-line no-extend-native, no-restricted-syntax
      WeakMap.prototype.getOrInsertComputed =
        shaka.polyfill.Map.mapGetOrInsertComputed_;
    }
  }

  /**
   * Returns the value for the given key if present; otherwise inserts
   * the default value, and returns that.
   * @param {K} key
   * @param {V} defaultValue
   * @return {V}
   * @this {Map<K, V>|WeakMap<K, V>}
   * @template K, V
   * @private
   */
  static mapGetOrInsert_(key, defaultValue) {
    if (!this.has(key)) {
      this.set(key, defaultValue);
    }
    return this.get(key);
  }

  /**
   * Returns the value for the given key if present; otherwise calls
   * the callback with the key, inserts the returned value, and returns that.
   * @param {K} key
   * @param {function(K): V} callbackFunction
   * @return {V}
   * @this {Map<K, V>|WeakMap<K, V>}
   * @template K, V
   * @private
   */
  static mapGetOrInsertComputed_(key, callbackFunction) {
    if (!this.has(key)) {
      this.set(key, callbackFunction(key));
    }
    return this.get(key);
  }
};

shaka.polyfill.register(shaka.polyfill.Map.install);
