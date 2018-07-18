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

goog.provide('shaka.test.SimpleIDB');

goog.require('shaka.util.PublicPromise');


shaka.test.SimpleIDB = class {
  /**
   * @param {!IDBDatabase} db
   */
  constructor(db) {
    this.db_ = db;
  }


  /**
   * @return {!Promise}
   */
  close() {
    this.db_.close();
    return Promise.resolve();
  }


  /**
   * @param {string} store
   * @param {!Object} value
   * @return {!Promise<number>}
   */
  add(store, value) {
    let promise = new shaka.util.PublicPromise();

    let transaction = this.db_.transaction([store], 'readwrite');
    transaction.oncomplete = () => promise.resolve();
    transaction.onerror = () => {
      promise.reject('Error adding ' + value + ' to ' + store);
    };
    transaction.onabort = () => {
      promise.reject('Aborted adding ' + value + ' to ' + store);
    };

    let key;
    transaction.objectStore(store).add(value).onsuccess = (e) => {
      key = e.target.result;
    };

    return promise.then(() => key);
  }


  /**
   * @param {string} name
   * @param {number} version
   * @param {!Array.<string>} stores
   * @return {!Promise.<shaka.test.SimpleIDB>}
   */
  static open(name, version, stores) {
    const settings = {autoIncrement: true};

    let upgraded = false;

    let wait = () => {
      const wait = 1000; // 1 second
      return new Promise((resolve) => setTimeout(resolve, wait));
    };

    let tryOpen = () => {
      /** @type {!shaka.util.PublicPromise} */
      let promise = new shaka.util.PublicPromise();

      let request = window.indexedDB.open(name, version);
      request.onerror = () => promise.reject();
      request.onupgradeneeded = (e) => {
        let db = e.target.transaction.db;
        stores.forEach((store) => db.createObjectStore(store, settings));

        upgraded = true;
      };
      request.onsuccess = (e) => {
        let db = e.target.result;
        let simple = new shaka.test.SimpleIDB(db);
        promise.resolve(simple);
      };

      return promise;
    };

    let chain = tryOpen();

    for (let i = 0; i < 5; i++) {
      chain = chain.then((db) => {
        if (upgraded) {
          return db;
        }

        db.close();
        return wait().then(tryOpen);
      });
    }

    return chain.then((db) => {
      if (upgraded) {
        return db;
      }

      db.close();
      return Promise.reject();
    });
  }
};
