/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Map getOrInsert/getOrInsertComputed methods
 *
 * @externs
 */

/**
 * Returns the value for the given key if present; otherwise inserts
 * the default value, and returns that.
 * @param {K} key
 * @param {V} defaultValue
 * @return {V}
 * @this {Map<K, V>}
 * @template K, V
 */
// eslint-disable-next-line no-extend-native
Map.prototype.getOrInsert = function(key, defaultValue) {};

/**
 * Returns the value for the given key if present; otherwise calls
 * the callback with the key, inserts the returned value, and returns that.
 * @param {K} key
 * @param {function(K): V} callbackFunction
 * @return {V}
 * @this {Map<K, V>}
 * @template K, V
 */
// eslint-disable-next-line no-extend-native
Map.prototype.getOrInsertComputed = function(key, callbackFunction) {};
