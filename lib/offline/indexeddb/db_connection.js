/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
    /** @private {!Array<shaka.offline.indexeddb.DBOperation>} */
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
    const transaction = this.connection_.transaction([store], type);
    const operation =
        new shaka.offline.indexeddb.DBOperation(transaction, store);

    this.pending_.push(operation);

    // Once the operation is done (regardless of outcome) stop tracking it.
    operation.promise().then(
        () => this.stopTracking_(operation),
        () => this.stopTracking_(operation));

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
