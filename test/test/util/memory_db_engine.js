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

goog.provide('shaka.test.MemoryDBEngine');



/**
 * An in-memory version of the DBEngine.  This is used to test the behavior of
 * Storage using a fake DBEngine.
 *
 * @constructor
 * @struct
 * @extends {shaka.offline.DBEngine}
 */
shaka.test.MemoryDBEngine = function() {
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
shaka.test.MemoryDBEngine.prototype.getAllData = function(storeName) {
  return this.getStore_(storeName);
};


/** @override */
shaka.test.MemoryDBEngine.prototype.initialized = function() {
  return this.stores_ != null;
};


/** @override */
shaka.test.MemoryDBEngine.prototype.init = function(storeMap) {
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
shaka.test.MemoryDBEngine.prototype.destroy = function() {
  this.stores_ = null;
  this.ids_ = null;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryDBEngine.prototype.get = function(storeName, key) {
  return Promise.resolve(this.getStore_(storeName)[key]);
};


/** @override */
shaka.test.MemoryDBEngine.prototype.forEach = function(storeName, callback) {
  shaka.util.MapUtils.values(this.getStore_(storeName)).forEach(callback);
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryDBEngine.prototype.insert = function(storeName, value) {
  var store = this.getStore_(storeName);
  goog.asserts.assert(!store[value.key], 'Value must not already exist');
  store[value.key] = value;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryDBEngine.prototype.remove = function(storeName, key) {
  var store = this.getStore_(storeName);
  delete store[key];
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryDBEngine.prototype.removeWhere = function(
    storeName, predicate) {
  var store = this.getStore_(storeName);
  for (var key in store) {
    if (predicate(store[Number(key)]))
      delete store[Number(key)];
  }
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryDBEngine.prototype.reserveId = function(storeName) {
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
shaka.test.MemoryDBEngine.prototype.getStore_ = function(storeName) {
  goog.asserts.assert(this.stores_, 'Must not be destroyed');
  goog.asserts.assert(storeName in this.stores_,
                      'Store ' + storeName + ' must appear in init()');
  return this.stores_[storeName];
};
