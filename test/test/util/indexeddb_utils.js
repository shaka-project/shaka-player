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

goog.provide('shaka.test.IndexedDBUtils');


/**
 * Make a connection to indexeddb. This assumes that it will be a new
 * database. If a new database can't be connected to after 5 attempts,
 * the test will fail.
 *
 * On IE/Edge, it is possible for the database to not be deleted when the
 * success callback is fired. This means that when we delete the database and
 * immediately create a new connection, we will connect to the old database.
 *
 * @param {string} name
 * @param {number} version
 * @param {function(IDBDatabase)} upgrade
 *
 * @return {!Promise.<IDBDatabase>}
 */
shaka.test.IndexedDBUtils.makeConnection = function(name, version, upgrade) {
  const wait = () => {
    return shaka.test.IndexedDBUtils.wait_(500);
  };

  const tryOpen = () => {
    return shaka.test.IndexedDBUtils.dbOpenNew_(name, version, upgrade);
  };

  // Try to open a new connection 5 times. If it fails to get a new
  // connection after 5 attempts (with delays in between), just give
  // up.
  return tryOpen().catch(() => {
    return wait().then(tryOpen);
  }).catch(() => {
    return wait().then(tryOpen);
  }).catch(() => {
    return wait().then(tryOpen);
  }).catch(() => {
    return wait().then(tryOpen);
  });
};


/**
 * @param {string} name
 * @return {!Promise}
 */
shaka.test.IndexedDBUtils.deleteDB = function(name) {
  /** @type {!shaka.util.PublicPromise} */
  let p = new shaka.util.PublicPromise();

  let goaway = window.indexedDB.deleteDatabase(name);
  goaway.onsuccess = (e) => { p.resolve(); };
  goaway.onerror = (e) => { p.reject(); };

  return p;
};


/**
 * @param {string} name
 * @param {number} version
 * @param {function(IDBDatabase)} upgrade
 *
 * @return {!Promise.<IDBDatabase>}
 * @private
 */
shaka.test.IndexedDBUtils.dbOpenNew_ = function(name, version, upgrade) {
  let upgraded = false;

  /** @type {!shaka.util.PublicPromise} */
  let p = new shaka.util.PublicPromise();

  let open = window.indexedDB.open(name, version);
  open.onerror = (e) => { p.reject(); };
  open.onsuccess = (e) => {
    // Make sure that the database actually upgraded when connecting or else
    // we will have an old copy.
    if (upgraded) {
      p.resolve(open.result);
    } else {
      // Make sure to close the connection as we won't be using it.
      open.result.close();
      p.reject();
    }
  };
  open.onupgradeneeded = (e) => {
    upgrade(/** @type {IDBDatabase} */ (open.result));
    upgraded = true;
  };

  return p;
};


/**
 * If the database exists, open the current version. If the database does
 * not exist, the returned promise will be rejected.
 *
 * @param {string} name
 * @return {!Promise.<IDBDatabase>}
 */
shaka.test.IndexedDBUtils.open = function(name) {
  /** @type {!shaka.util.PublicPromise} */
  let p = new shaka.util.PublicPromise();

  let open = window.indexedDB.open(name);
  open.onerror = (e) => { p.reject(); };
  open.onsuccess = (e) => { p.resolve(open.result); };

  return p;
};


/**
 * @param {number} ms
 * @return {!Promise}
 * @private
 */
shaka.test.IndexedDBUtils.wait_ = function(ms) {
  /** @type {!shaka.util.PublicPromise} */
  let p = new shaka.util.PublicPromise();
  setTimeout(() => p.resolve(), ms);
  return p;
};
