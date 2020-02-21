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

goog.provide('shaka.test.CannedIDB');

/**
 * A testing utility that can be used to dump and restore entire IndexedDB
 * databases.  This can be inserted into a running app to snapshot databases
 * for testing.
 *
 * @example
 *   shaka.test = shaka.test || {};
 *   s = document.createElement('script');
 *   s.src = '../test/test/util/canned_idb.js';
 *   document.head.appendChild(s);
 *   dump = await shaka.test.CannedIDB.dumpJSON('shaka_offline_db', true);
 */
shaka.test.CannedIDB = class {
  /**
   * @param {string} name The name of the database to dump.
   * @param {boolean=} dummyArrayBuffers If true, replace array buffer data with
   *   dummy data, as you might want for generating unit test data. Defaults to
   *   false.
   * @return {!Promise.<string>} A JSON string that can be used to recreate the
   *   database later in a call to restoreJSON().
   */
  static async dumpJSON(name, dummyArrayBuffers) {
    const savedDatabase = await this.dump(name, dummyArrayBuffers);
    const replacer = this.replacer_.bind(null, dummyArrayBuffers);
    return JSON.stringify(savedDatabase, replacer);
  }

  /**
   * @param {string} name The name of the database to dump.
   * @return {!Promise.<shaka.test.CannedIDB.SavedDatabase>} An object that can
   *   be used to recreate the database later in a call to restore().
   */
  static async dump(name) {
    // Open the database, which should exist already.
    const db = await this.openDatabase_(name);

    try {
      const savedDatabase = {
        version: db.version,
        stores: {},
      };

      // For each store, dump the store parameters and data.
      const dumpOperations = [];
      for (const storeName of db.objectStoreNames) {
        dumpOperations.push(this.dumpStore_(db, storeName, savedDatabase));
      }
      await Promise.all(dumpOperations);

      return savedDatabase;
    } finally {
      // Make sure the DB gets closed no matter what.
      db.close();
    }
  }

  /**
   * @param {string} name The name of the database to restore.
   * @param {string} savedDatabaseJson A JSON string containing the database
   *   definition and the data to populate it with.
   * @param {boolean=} wipeDatabase If true, wipe the database before loading
   *   the saved data.  If false, add stores and data, but keep any existing
   *   stores and data.  Defaults to true.
   * @return {!Promise} Resolved when the operation is complete.
   */
  static async restoreJSON(name, savedDatabaseJson, wipeDatabase) {
    const savedDatabase = JSON.parse(savedDatabaseJson, this.reviver_);
    await this.restore(name, savedDatabase, wipeDatabase);
  }

  /**
   * @param {string} name The name of the database to restore.
   * @param {shaka.test.CannedIDB.SavedDatabase} savedDatabase An object
   *   containing the database definition and the data to populate it with.
   * @param {boolean=} wipeDatabase If true, wipe the database before loading
   *   the saved data.  If false, add stores and data, but keep any existing
   *   stores and data.  Defaults to true.
   * @return {!Promise} Resolved when the operation is complete.
   */
  static async restore(name, savedDatabase, wipeDatabase) {
    wipeDatabase = (wipeDatabase == undefined) ? true : wipeDatabase;

    if (wipeDatabase) {
      // Wipe out any existing data.
      await this.deleteDatabase_(name);
    }

    // Create a new DB, or open an existing one, and add the stores we need.
    const db = await this.createDatabase_(name, savedDatabase);

    try {
      // Populate it with data.
      await this.populateDatabase_(db, savedDatabase);
    } finally {
      // Make sure the DB gets closed no matter what.
      db.close();
    }
  }

  /**
   * A replacer callback for JSON.stringify.  It creates special objects to
   * represent types that can't be directly stringified into JSON, such as
   * ArrayBuffer.  Should be used with bind() to supply the dummyArrayBuffers
   * argument.
   *
   * @param {boolean} dummyArrayBuffers
   * @param {string} key
   * @param {?} value
   * @return {?}
   * @private
   */
  static replacer_(dummyArrayBuffers, key, value) {
    if (value instanceof ArrayBuffer) {
      /** @type {string} */
      let data;
      if (dummyArrayBuffers) {
        data = '';
      } else {
        data = shaka.util.Uint8ArrayUtils.toBase64(new Uint8Array(value));
      }
      return {
        __type__: 'ArrayBuffer',
        __value__: data,
      };
    }
    return value;
  }

  /**
   * A reviver callback for JSON.parse.  It recognizes special objects from
   * replacer_ and turns them back into their original format.
   *
   * @param {string} key
   * @param {?} value
   * @return {?}
   * @private
   */
  static reviver_(key, value) {
    if (value && value.__type__ == 'ArrayBuffer') {
      return shaka.util.Uint8ArrayUtils.fromBase64(value.__value__).buffer;
    }
    return value;
  }

  /**
   * @param {string} name The name of the database to open.
   * @return {!Promise.<IDBDatabase>} Resolved when the named DB has been
   *   opened.
   * @private
   */
  static openDatabase_(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name);

      request.onupgradeneeded = (event) => {
        reject(new Error('DB did not exist!'));
        const transaction = event.target.transaction;
        transaction.abort();
      };

      request.onsuccess = (event) => {
        /** @type {IDBDatabase} */
        const db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        event.preventDefault();
        reject(request.error);
      };
    });
  }

  /**
   * @param {IDBDatabase} db An open database connection.
   * @param {string} name The store name to dump.
   * @param {shaka.test.CannedIDB.SavedDatabase} savedDatabase An object where
   *   we write the store parameters and the data from the named store.
   * @return {!Promise} Resolved when the store has been written to
   *   savedDatabase.stores.
   * @private
   */
  static async dumpStore_(db, name, savedDatabase) {
    const transactionType = 'readonly';
    const transaction = db.transaction([name], transactionType);
    /** @type {!IDBObjectStore} */
    const store = transaction.objectStore(name);
    /** @type {!shaka.offline.indexeddb.DBOperation} */
    const op = new shaka.offline.indexeddb.DBOperation(transaction, name);
    shaka.log.debug('Dumping store', name);

    /** @type {shaka.test.CannedIDB.SavedStore} */
    const savedStore = {
      parameters: {
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
      },
      data: [],
    };

    await op.forEachEntry((key, value) => {
      // Only store the key if there is no explicit keyPath for this store.
      const data = {value: value};
      if (!store.keyPath) {
        data.key = key;
      }
      savedStore.data.push(data);
    });

    await op.promise();
    shaka.log.debug('Dumped', savedStore.data.length, 'entries from store',
                    name);
    savedDatabase.stores[name] = savedStore;
  }

  /**
   * @param {string} name The name of the database to delete.
   * @return {!Promise} Resolved when the named DB has been deleted.
   * @private
   */
  static deleteDatabase_(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);

      request.onsuccess = (event) => {
        resolve();
      };

      request.onerror = (event) => {
        event.preventDefault();
        resolve();
      };
    });
  }

  /**
   * Creates a database.  Does not populate it.
   *
   * @param {string} name The name of the database to create.
   * @param {shaka.test.CannedIDB.SavedDatabase} savedDatabase An object
   *   containing the database definition and the data to populate it with.
   * @return {!Promise.<IDBDatabase>} Resolved when the named DB has been
   *   created.
   * @private
   */
  static createDatabase_(name, savedDatabase) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, savedDatabase.version);

      request.onupgradeneeded = (event) => {
        shaka.log.debug('DB upgrade from', event.oldVersion, 'to',
                        savedDatabase.version);
        const transaction = event.target.transaction;
        const db = transaction.db;

        // We will ignore existing stores, so first make a map of them.
        const existingStoreMap = {};
        for (const storeName of db.objectStoreNames) {
          existingStoreMap[storeName] = true;
        }

        for (const storeName in savedDatabase.stores) {
          if (storeName in existingStoreMap) {
            shaka.log.debug('Ignoring existing store', storeName);
          } else {
            const storeInfo = savedDatabase.stores[storeName];

            // Legacy Edge can't handle a null keyPath, and throws errors if you
            // specify that.  So delete it if it's null.
            if (storeInfo.parameters.keyPath == null) {
              delete storeInfo.parameters.keyPath;
            }

            shaka.log.debug('Creating store', storeName, storeInfo.parameters);
            db.createObjectStore(storeName, storeInfo.parameters);
          }
        }

        // If there isn't an oncomplete on transaction, we seem not to get a
        // call to request.onsuccess.  Perhaps the browser blocks the
        // transaction or request until there is an oncomplete handler.
        transaction.oncomplete = (event) => {};
      };

      request.onsuccess = (event) => {
        /** @type {IDBDatabase} */
        const db = event.target.result;
        resolve(db);
      };

      request.onerror = (event) => {
        event.preventDefault();
        reject(request.error);
      };
    });
  }

  /**
   * @param {IDBDatabase} db An open database connection.
   * @param {shaka.test.CannedIDB.SavedDatabase} savedDatabase An object
   *   containing the database definition and the data to populate it with.
   * @return {!Promise} Resolved when the named DB has been populated with data.
   * @private
   */
  static populateDatabase_(db, savedDatabase) {
    return new Promise((resolve, reject) => {
      const transactionType = 'readwrite';
      const storeNames = Object.keys(savedDatabase.stores);
      const transaction = db.transaction(storeNames, transactionType);

      for (const storeName in savedDatabase.stores) {
        const store = transaction.objectStore(storeName);
        const storeInfo = savedDatabase.stores[storeName];

        shaka.log.debug('Populating store', storeName, 'with',
                        storeInfo.data.length, 'entries');
        storeInfo.data.forEach((item) => {
          // If this store uses an explicit keyPath, we can't specify a key.
          if (storeInfo.parameters.keyPath) {
            store.add(item.value);
          } else {
            store.add(item.value, item.key);
          }
        });
      }

      transaction.oncomplete = (event) => {
        resolve();
      };

      transaction.onerror = (event) => {
        reject(event.error);
        event.preventDefault();
      };
    });
  }
};

/**
 * @typedef {{
 *   keyPath: ?,
 *   autoIncrement: boolean,
 * }}
 */
shaka.test.CannedIDB.SavedStoreParameters;

/**
 * @typedef {{
 *   key: ?,
 *   value: ?,
 * }}
 */
shaka.test.CannedIDB.SavedStoreDataItem;

/**
 * @typedef {{
 *   parameters: shaka.test.CannedIDB.SavedStoreParameters,
 *   data: !Array.<shaka.test.CannedIDB.SavedStoreDataItem>,
 * }}
 */
shaka.test.CannedIDB.SavedStore;

/**
 * @typedef {{
 *   version: number,
 *   stores: !Object.<string, shaka.test.CannedIDB.SavedStore>,
 * }}
 */
shaka.test.CannedIDB.SavedDatabase;
