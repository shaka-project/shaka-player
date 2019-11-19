/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.IndexedDBUtils');


shaka.test.IndexedDBUtils = class {
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
  static async makeConnection(name, version, upgrade) {
    const wait = () => {
      return shaka.test.Util.delay(0.5);
    };

    const tryOpen = () => {
      return shaka.test.IndexedDBUtils.dbOpenNew_(name, version, upgrade);
    };

    // Try to open a new connection 5 times. If it fails to get a new
    // connection after 5 attempts (with delays in between), just give
    // up.
    let lastError;
    for (const _ of shaka.util.Iterables.range(5)) {
      shaka.util.Functional.ignored(_);
      try {
        return await tryOpen();  // eslint-disable-line no-await-in-loop
      } catch (e) {  // eslint-disable-line no-restricted-syntax
        lastError = e;
        await wait();  // eslint-disable-line no-await-in-loop
      }
    }
    throw lastError;
  }

  /**
   * @param {string} name
   * @return {!Promise}
   */
  static deleteDB(name) {
    /** @type {!shaka.util.PublicPromise} */
    const p = new shaka.util.PublicPromise();

    const goaway = window.indexedDB.deleteDatabase(name);
    goaway.onsuccess = (e) => {
      p.resolve();
    };
    goaway.onerror = (e) => {
      p.reject();
    };

    return p;
  }

  /**
   * @param {string} name
   * @param {number} version
   * @param {function(IDBDatabase)} upgrade
   *
   * @return {!Promise.<IDBDatabase>}
   * @private
   */
  static dbOpenNew_(name, version, upgrade) {
    let upgraded = false;

    /** @type {!shaka.util.PublicPromise} */
    const p = new shaka.util.PublicPromise();

    const open = window.indexedDB.open(name, version);
    open.onerror = (e) => {
      p.reject();
    };
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
  }

  /**
   * If the database exists, open the current version. If the database does
   * not exist, the returned promise will be rejected.
   *
   * @param {string} name
   * @return {!Promise.<IDBDatabase>}
   */
  static open(name) {
    /** @type {!shaka.util.PublicPromise} */
    const p = new shaka.util.PublicPromise();

    const open = window.indexedDB.open(name);
    open.onerror = (e) => {
      p.reject();
    };
    open.onsuccess = (e) => {
      p.resolve(open.result);
    };

    return p;
  }
};
