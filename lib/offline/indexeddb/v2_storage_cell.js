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

goog.provide('shaka.offline.indexeddb.V2StorageCell');

goog.require('shaka.offline.indexeddb.DBConnection');
goog.require('shaka.util.Error');


/**
 * The V2StorageCell is for all stores that follow the shaka.externs V2 offline
 * types. This storage cell will work for both IndexedDB version 2 and 3 as
 * both used the shaka.externs V2 offline types.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.indexeddb.V2StorageCell = class {
  /**
   * @param {IDBDatabase} connection
   * @param {string} segmentStore
   * @param {string} manifestStore
   * @param {boolean} isFixedKey
   */
  constructor(connection,
              segmentStore,
              manifestStore,
              isFixedKey) {
    /** @private {!shaka.offline.indexeddb.DBConnection} */
    this.connection_ = new shaka.offline.indexeddb.DBConnection(connection);

    /** @private {string} */
    this.segmentStore_ = segmentStore;
    /** @private {string} */
    this.manifestStore_ = manifestStore;

    /** @private {boolean} */
    this.isFixedKey_ = isFixedKey;
  }

  /**
   * @override
   */
  destroy() { return this.connection_.destroy(); }

  /**
   * @override
   */
  hasFixedKeySpace() { return this.isFixedKey_; }

  /**
   * @override
   */
  addSegments(segments) { return this.add_(this.segmentStore_, segments); }

  /**
   * @override
   */
  removeSegments(keys, onRemove) {
    return this.remove_(this.segmentStore_, keys, onRemove);
  }

  /**
   * @override
   */
  getSegments(keys) { return this.get_(this.segmentStore_, keys); }

  /**
   * @override
   */
  addManifests(manifests) { return this.add_(this.manifestStore_, manifests); }

  /**
   * @override
   */
  updateManifestExpiration(key, newExpiration) {
    let op = this.connection_.startReadWriteOperation(this.manifestStore_);
    let store = op.store();
    store.get(key).onsuccess = (e) => {
      let found = e.target.result;
      // If we can't find the value, then there is nothing for us to update.
      if (found) {
        found.expiration = newExpiration;
        store.put(found, key);
      }
    };

    return op.promise();
  }

  /**
   * @override
   */
  removeManifests(keys, onRemove) {
    return this.remove_(this.manifestStore_, keys, onRemove);
  }

  /**
   * @override
   */
  getManifests(keys) { return this.get_(this.manifestStore_, keys); }

  /**
   * @override
   */
  async getAllManifests() {
    /** @type {!shaka.offline.indexeddb.DBOperation} */
    const op = this.connection_.startReadOnlyOperation(this.manifestStore_);
    /** @type {!Map.<number, shaka.extern.ManifestDB>} */
    const values = new Map();

    await op.forEachEntry(
        (/** number */ key, /** shaka.extern.ManifestDB */ value) => {
          values.set(key, value);
        });

    await op.promise();
    return values;
  }

  /**
   * @param {string} storeName
   * @param {!Array.<T>} values
   * @return {!Promise.<!Array.<number>>}
   * @template T
   * @private
   */
  add_(storeName, values) {
    // In the case that this storage cell does not support add-operations, just
    // reject the request immediately instead of allowing it to try.
    if (this.isFixedKey_) {
      return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.NEW_KEY_OPERATION_NOT_SUPPORTED,
        'Cannot add new value to ' + storeName));
    }

    let op = this.connection_.startReadWriteOperation(storeName);
    let store = op.store();

    /** @type {!Array.<number>} */
    let keys = [];

    // Write each segment out. When each request completes, the key will
    // be in |event.target.result| as can be seen in
    // https://w3c.github.io/IndexedDB/#key-generator-construct.
    values.forEach((value) => {
      let request = store.add(value);
      request.onsuccess = (event) => {
        let key = event.target.result;
        keys.push(key);
      };
    });

    // Wait until the operation completes or else |keys| will not be fully
    // populated.
    return op.promise().then(() => keys);
  }

  /**
   * @param {string} storeName
   * @param {!Array.<number>} keys
   * @param {function(number)} onRemove
   * @return {!Promise}
   * @private
   */
  remove_(storeName, keys, onRemove) {
    let op = this.connection_.startReadWriteOperation(storeName);
    let store = op.store();

    keys.forEach((key) => {
      store.delete(key).onsuccess = () => onRemove(key);
    });

    return op.promise();
  }

  /**
   * @param {string} storeName
   * @param {!Array.<number>} keys
   * @return {!Promise.<!Array.<T>>}
   * @template T
   * @private
   */
  get_(storeName, keys) {
    let op = this.connection_.startReadOnlyOperation(storeName);
    let store = op.store();

    let values = {};
    let missing = [];

    // Use a map to store the objects so that we can reorder the results to
    // match the order of |keys|.
    keys.forEach((key) => {
      let request = store.get(key);
      request.onsuccess = () => {
        // Make sure a defined value was found. Indexeddb treats no-value found
        // as a success with an undefined result.
        if (request.result == undefined) {
          missing.push(key);
        }

        values[key] = request.result;
      };
    });

    // Wait until the operation completes or else values may be missing from
    // |values|. Use the original key list to convert the map to a list so that
    // the order will match.
    return op.promise().then(() => {
      if (missing.length) {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.KEY_NOT_FOUND,
            'Could not find values for ' + missing
        ));
      }

      return keys.map((key) => values[key]);
    });
  }
};
