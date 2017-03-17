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

goog.provide('shaka.offline.IStorageEngine');

goog.require('shaka.util.IDestroyable');



/**
 * An interface to abstract away the type of storage used on a specific
 * platform.
 *
 * @interface
 * @extends {shaka.util.IDestroyable}
 */
shaka.offline.IStorageEngine = function() {};


/**
 * Gets whether the storage engine is initialized.
 *
 * @return {boolean}
 */
shaka.offline.IStorageEngine.prototype.initialized;


/**
 * Initializes the storage system and creates the required tables.
 *
 * If opt_retryCount is given, then we are creating a new database and expect
 * an 'upgradeneeded' event.  If we don't get one, we will retry opt_retryCount
 * times.  This is used to work around a bug in IE/Edge and is only used in
 * our unit tests.
 *
 * @see https://goo.gl/hOYJvN
 *
 * @param {!Object.<string, string>} storeMap
 *   A map of store name to the key path.
 * @param {number=} opt_retryCount
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.init;


/**
 * Gets the item with the given ID in the store.
 *
 * @param {string} storeName
 * @param {number} key
 * @return {!Promise.<T>}
 * @template T
 */
shaka.offline.IStorageEngine.prototype.get;


/**
 * Calls the given callback for each value in the store. The promise will
 * resolve after all items have been traversed.
 *
 * @param {string} storeName
 * @param {function(T)} callback
 * @return {!Promise}
 * @template T
 */
shaka.offline.IStorageEngine.prototype.forEach;


/**
 * Adds or updates the given value in the store.
 *
 * @param {string} storeName
 * @param {!Object} value
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.insert;


/**
 * Removes the item with the given key.
 *
 * @param {string} storeName
 * @param {number} key
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.remove;


/**
 * Removes all items for which the given predicate returns true.
 *
 * @param {string} storeName
 * @param {function(T):boolean} callback
 * @return {!Promise.<number>}
 * @template T
 */
shaka.offline.IStorageEngine.prototype.removeWhere;


/**
 * Reserves the next ID and returns it.
 *
 * @param {string} storeName
 * @return {number}
 */
shaka.offline.IStorageEngine.prototype.reserveId;
