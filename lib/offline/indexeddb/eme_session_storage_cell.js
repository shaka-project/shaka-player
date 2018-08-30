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

goog.provide('shaka.offline.indexeddb.EmeSessionStorageCell');

goog.require('shaka.offline.indexeddb.DBConnection');


/**
 * The implementation of the EME session storage cell.
 *
 * @implements {shaka.extern.EmeSessionStorageCell}
 */
shaka.offline.indexeddb.EmeSessionStorageCell = class {
  /**
   * @param {IDBDatabase} connection
   * @param {string} store
   */
  constructor(connection, store) {
    /** @private {!shaka.offline.indexeddb.DBConnection} */
    this.connection_ = new shaka.offline.indexeddb.DBConnection(connection);

    /** @private {string} */
    this.store_ = store;
  }

  /** @override */
  destroy() { return this.connection_.destroy(); }

  /** @override */
  async getAll() {
    /** @type {!shaka.offline.indexeddb.DBOperation} */
    const op = this.connection_.startReadOnlyOperation(this.store_);
    /** @type {!Array.<shaka.extern.EmeSessionDB>} */
    const values = [];

    await op.forEachEntry((key, value) => {
      values.push(value);
    });

    await op.promise();
    return values;
  }

  /** @override */
  add(sessions) {
    const op = this.connection_.startReadWriteOperation(this.store_);
    const store = op.store();

    for (const session of sessions) {
      store.add(session);
    }

    return op.promise();
  }

  /** @override */
  async remove(sessionIds) {
    /** @type {!shaka.offline.indexeddb.DBOperation} */
    const op = this.connection_.startReadWriteOperation(this.store_);

    await op.forEachEntry((key, value, cursor) => {
      if (sessionIds.indexOf(value.sessionId) >= 0) {
        cursor.delete();
      }
    });

    await op.promise();
  }
};
