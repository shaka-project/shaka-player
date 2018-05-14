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
  abort() {
    try {
      this.transaction_.abort();
    } catch (e) {
      // Ignore any exceptions that may be thrown as a result of aborting
      // the transaction.
    }

    // Wait for the promise to be rejected, but ignore the rejection error.
    return this.promise_.catch(() => {});
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
