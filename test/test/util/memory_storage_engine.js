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

goog.provide('shaka.test.MemoryStorageEngine');



/**
 * An in-memory implementation of IStorageEngine.  This is used to test the
 * behavior of Storage using a fake StorageEngine.
 *
 * @struct
 * @constructor
 * @implements {shaka.offline.IStorageEngine}
 */
shaka.test.MemoryStorageEngine = function() {
  /** @private {Object.<string, !Object.<number, *>>} */
  this.stores_ = null;

  /** @private {Object.<string, number>} */
  this.ids_ = null;
};


/**
 * Returns the data for the given store name, synchronously.
 *
 * @param {string} storeName
 * @return {!Object.<number, *>}
 */
shaka.test.MemoryStorageEngine.prototype.getAllData = function(storeName) {
  return this.getStore_(storeName);
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.initialized = function() {
  return this.stores_ != null;
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.init = function(storeMap) {
  this.stores_ = {};
  this.ids_ = {};
  for (var storeName in storeMap) {
    goog.asserts.assert(storeMap[storeName] == 'key', 'Key path must be "key"');
    this.stores_[storeName] = {};
    this.ids_[storeName] = 0;
  }
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.destroy = function() {
  this.stores_ = null;
  this.ids_ = null;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.get = function(storeName, key) {
  return Promise.resolve(this.getStore_(storeName)[key]);
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.forEach = function(
    storeName, callback) {
  shaka.util.MapUtils.values(this.getStore_(storeName)).forEach(callback);
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.insert = function(storeName, value) {
  var store = this.getStore_(storeName);
  goog.asserts.assert(!store[value.key], 'Value must not already exist');
  store[value.key] = value;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.remove = function(storeName, key) {
  var store = this.getStore_(storeName);
  delete store[key];
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.removeKeys = function(storeName,
                                                          keys,
                                                          opt_onKeyRemoved) {
  var store = this.getStore_(storeName);
  for (var key in store) {
    key = Number(key);
    if (keys.indexOf(key) >= 0) {
      delete store[key];
    }
  }
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.reserveId = function(storeName) {
  goog.asserts.assert(this.ids_, 'Must not be destroyed');
  goog.asserts.assert(storeName in this.ids_,
                      'Store ' + storeName + ' must appear in init()');
  return this.ids_[storeName]++;
};


/**
 * @param {string} storeName
 * @return {!Object.<number, *>}
 * @private
 */
shaka.test.MemoryStorageEngine.prototype.getStore_ = function(storeName) {
  goog.asserts.assert(this.stores_, 'Must not be destroyed');
  goog.asserts.assert(storeName in this.stores_,
                      'Store ' + storeName + ' must appear in init()');
  return this.stores_[storeName];
};
