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

goog.provide('shaka.offline.indexeddb.DBConnection');

goog.require('shaka.offline.indexeddb.DBOperation');
goog.require('shaka.util.ArrayUtils');


/**
 * DBConnection is used to manage an IndexedDB connection. It can create new
 * operations. If the connection is killed (via |destroy|) all pending
 * operations will be cancelled.
 */
shaka.offline.indexeddb.DBConnection = class {
  /**
   * @param {IDBDatabase} connection A connection to an IndexedDB instance.
   */
  constructor(connection) {
    /** @private {IDBDatabase} */
    this.connection_ = connection;
    /** @private {!Array.<shaka.offline.indexeddb.DBOperation>} */
    this.pending_ = [];
  }

  /**
   * @return {!Promise}
   */
  destroy() {
    return Promise.all(this.pending_.map((op) => {
      return op.abort();
    }));
  }

  /**
   * @param {string} store The name of the store that the operation should
   *                       occur on.
   * @return {!shaka.offline.indexeddb.DBOperation}
   */
  startReadOnlyOperation(store) {
    return this.startOperation_(store, 'readonly');
  }

  /**
   * @param {string} store The name of the store that the operation should
   *                       occur on.
   * @return {!shaka.offline.indexeddb.DBOperation}
   */
  startReadWriteOperation(store) {
    return this.startOperation_(store, 'readwrite');
  }

  /**
   * @param {string} store The name of the store that the operation should
   *                       occur on.
   * @param {string} type The type of operation being performed on the store.
   *                      This determines what commands may be performed. This
   *                      can either be "readonly" or "readwrite".
   * @return {!shaka.offline.indexeddb.DBOperation}
   * @private
   */
  startOperation_(store, type) {
    let transaction = this.connection_.transaction([store], type);
    let operation = new shaka.offline.indexeddb.DBOperation(transaction, store);

    this.pending_.push(operation);

    // Once the operation is done (regardless of outcome) stop tracking it.
    operation.promise().then(
        () => this.stopTracking_(operation),
        () => this.stopTracking_(operation)
    );

    return operation;
  }

  /**
   * @param {!shaka.offline.indexeddb.DBOperation} operation
   * @private
   */
  stopTracking_(operation) {
    shaka.util.ArrayUtils.remove(this.pending_, operation);
  }
};
