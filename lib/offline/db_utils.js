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

goog.provide('shaka.offline.DBUtils');

goog.require('shaka.util.Error');
goog.require('shaka.util.PublicPromise');


/**
 * @enum {string}
 */
shaka.offline.DBUtils.Mode = {
  READ_ONLY: 'readonly',
  READ_WRITE: 'readwrite'
};


/**
 * The name for the stores that are used in the version 2 of our
 * indexed db storage.
 *
 * @enum {string}
 */
shaka.offline.DBUtils.StoreV2 = {
  MANIFEST: 'manifest-v2',
  SEGMENT: 'segment-v2'
};


/**
 * The name for the stores that are used in the version 1 of our
 * indexed db storage.
 *
 * @enum {string}
 */
shaka.offline.DBUtils.StoreV1 = {
  MANIFEST: 'manifest',
  SEGMENT: 'segment'
};


/**
 * @param {IDBObjectStore} store
 * @param {function(number, Object, function())} callback
 * @param {function()} done
 *    A callback that is called when iterating over all elements has completed.
*/
shaka.offline.DBUtils.forEach = function(store, callback, done) {
  /** @type {IDBRequest}  */
  var request = store.openCursor();
  request.onsuccess = function(event) {
    /** @type {IDBCursor} */
    var cursor = event.target.result;

    var next = function() {
      cursor.continue();
    };

    if (!cursor) {
      // When we reach the end of the data that the cursor is iterating
      // over, |event.target.result| will be null to signal the end of the
      // iteration.
      // https://developer.mozilla.org/en-US/docs/Web/API/IDBCursor/continue
      done();
    } else {
      /** @type {number} */
      var key = /** @type {number} */ (cursor.key);
      /** @type {Object} */
      var value = /** @type {Object} */ (cursor.value);

      callback(key, value, next);
    }
  };
};


/**
 * On IE/Edge, it is possible for the database to not be deleted when the
 * success callback is fired.  This means that when we delete the database and
 * immediately create a new connection, we will connect to the old database.
 * If this happens, we need to close the connection and retry.
 *
 * @see https://goo.gl/hOYJvN
 *
 * @param {string} name
 * @param {number} version
 * @param {function(number, !IDBDatabase, !IDBTransaction)} onUpgrade
 * @param {number=} opt_updateRetries The number of attempts at opening the
 *                                    database with the given version number.
 *                                    If the database opens without the version
 *                                    after all retries expire, then the
 *                                    connection will fail.
 * @return {!Promise.<!IDBDatabase>}
 */
shaka.offline.DBUtils.open = function(name,
                                      version,
                                      onUpgrade,
                                      opt_updateRetries) {
  /** @type {number} */
  var retries = opt_updateRetries || 0;

  /** @type {boolean} */
  var upgraded = false;

  var upgradeWrapper = function(version, db, transaction) {
    onUpgrade(version, db, transaction);
    upgraded = true;
  };

  var wait = function() {
    var wait = 1000; // 1 second
    return new Promise(function(resolve) {
      setTimeout(resolve, wait);
    });
  };

  var open = function() {
    return shaka.offline.DBUtils.open_(name, version, upgradeWrapper);
  };

  var retry = function(db) {
    if (upgraded) { return db; }

    // Since we are not using this |db| we need to make sure we close it.
    db.close();
    return wait().then(function() { return open(); });
  };

  var failIfNotUpgraded = function(db) {
    if (upgraded) { return db; }

    // Since we are not using |db| we need to make sure we close it.
    db.close();
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        'Failed to issue upgrade after ' + retries + ' retries'));
  };

  var promise = Promise.resolve().then(open);

  // If we are gonna retry, we need to create a chain of retries. If we are
  // wanting an upgrade, then we should fail if we do not upgrade.
  if (retries) {
    for (var i = 0; i < retries; i++) {
      promise = promise.then(retry);
    }

    promise = promise.then(failIfNotUpgraded);
  }

  return promise;
};


/**
 * @param {string} name
 * @param {number} version
 * @param {function(number, !IDBDatabase, !IDBTransaction)} onUpgrade
 * @return {!Promise.<!IDBDatabase>}
 * @private
 */
shaka.offline.DBUtils.open_ = function(name, version, onUpgrade) {
  var indexedDB = window.indexedDB;
  var request = indexedDB.open(name, version);

  /** @type {!shaka.util.PublicPromise} */
  var promise = new shaka.util.PublicPromise();

  request.onupgradeneeded = function(event) {
    var oldVersion = /** @const {number} */ (event.oldVersion);
    var transaction = /** @type {!IDBTransaction} */ (event.target.transaction);
    var db = /** @type {!IDBDatabase} */ (transaction.db);

    onUpgrade(oldVersion, db, transaction);
  };

  request.onsuccess = function(event) {
    /** @type {IDBDatabase} */
    var db = event.target.result;
    promise.resolve(db);
  };

  request.onerror = function(event) {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        'Failed to open indexeddb'));
  };

  return promise;
};
