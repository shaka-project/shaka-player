/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.DBOperation');


goog.require('shaka.util.PublicPromise');


/**
 * A DBOperation wraps an IndexedDB transaction in a promise.
 */
shaka.offline.indexeddb.DBOperation = class {
  /**
   * @param {IDBTransaction} transaction
   * @param {string} storeName
   */
  constructor(transaction, storeName) {
    /** @private {IDBTransaction} */
    this.transaction_ = transaction;
    /** @private {IDBObjectStore} */
    this.store_ = transaction.objectStore(storeName);
    /** @private {!shaka.util.PublicPromise} */
    this.promise_ = new shaka.util.PublicPromise();

    // Connect the transaction and the promise together.
    // |event.preventDefault()| is used on all non-successful callbacks to
    // prevent Firefox from surfacing the error on the main thread.
    transaction.onabort = (event) => {
      event.preventDefault();
      this.promise_.reject();
    };
    transaction.onerror = (event) => {
      event.preventDefault();
      this.promise_.reject();
    };
    transaction.oncomplete = (event) => {
      this.promise_.resolve();
    };
  }

  /**
   * @return {!Promise}
   */
  async abort() {
    try {
      this.transaction_.abort();
    } catch (e) {
      // Ignore any exceptions that may be thrown as a result of aborting
      // the transaction.
    }

    try {
      // Wait for the promise to be rejected, but ignore the rejection error.
      await this.promise_;
    } catch (e) {}
  }

  /**
   * Calls the given callback for each entry in the database.
   *
   * @param {function(!IDBKeyType, T, !IDBCursorWithValue=):(Promise|undefined)}
   *   callback
   * @return {!Promise}
   * @template T
   */
  forEachEntry(callback) {
    return new Promise((resolve, reject) => {
      const req = this.store_.openCursor();
      req.onerror = reject;
      req.onsuccess = async (event) => {
        // When we reach the end of the data that the cursor is iterating over,
        // |req.result| will be null to signal the end of the iteration.
        // https://developer.mozilla.org/en-US/docs/Web/API/IDBCursor/continue
        if (req.result == null) {
          resolve();
          return;
        }

        /** @type {!IDBCursorWithValue} */
        const cursor = req.result;
        await callback(cursor.key, cursor.value, cursor);
        cursor.continue();
      };
    });
  }

  /**
   * Get the store that the operation can interact with. Requests can be made
   * on the store. All requests made on the store will complete successfully
   * before the operation's promise will resolve. If any request fails, the
   * operation's promise will be rejected.
   *
   * @return {IDBObjectStore}
   */
  store() { return this.store_; }

  /**
   * Get the promise that wraps the transaction. This promise will resolve when
   * all requests on the object store complete successfully and the transaction
   * completes. If any request fails or the operation is aborted, the promise
   * will be rejected.
   *
   * @return {!Promise}
   */
  promise() { return this.promise_; }
};
