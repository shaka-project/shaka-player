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

goog.provide('shaka.offline.DBEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.offline.IStorageEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.PublicPromise');



/**
 * This manages all operations on an IndexedDB.  This wraps all operations
 * in Promises.  All Promises will resolve once the transaction has completed.
 * Depending on the browser, this may or may not be after the data is flushed
 * to disk.  https://goo.gl/zMOeJc
 *
 * @struct
 * @constructor
 * @implements {shaka.offline.IStorageEngine}
 */
shaka.offline.DBEngine = function() {
  goog.asserts.assert(
      shaka.offline.DBEngine.isSupported(),
      'DBEngine should not be called when DBEngine is not supported');

  /** @private {IDBDatabase} */
  this.db_ = null;

  /** @private {!Array.<shaka.offline.DBEngine.Operation>} */
  this.operations_ = [];

  /** @private {!Object.<string, number>} */
  this.currentIdMap_ = {};
};


/**
 * @typedef {{
 *   transaction: !IDBTransaction,
 *   promise: !shaka.util.PublicPromise
 * }}
 *
 * @property {!IDBTransaction} transaction
 *   The transaction that this operation is using.
 * @property {!shaka.util.PublicPromise} promise
 *   The promise associated with the operation.
 */
shaka.offline.DBEngine.Operation;


/** @private {string} */
shaka.offline.DBEngine.DB_NAME_ = 'shaka_offline_db';


/** @private @const {number} */
shaka.offline.DBEngine.DB_VERSION_ = 1;


/**
 * Determines if the browsers supports IndexedDB.
 * @return {boolean}
 */
shaka.offline.DBEngine.isSupported = function() {
  return window.indexedDB != null;
};


/**
 * Delete the database.  There must be no open connections to the database.
 * @return {!Promise}
 */
shaka.offline.DBEngine.deleteDatabase = function() {
  if (!window.indexedDB)
    return Promise.resolve();
  var request =
      window.indexedDB.deleteDatabase(shaka.offline.DBEngine.DB_NAME_);

  var p = new shaka.util.PublicPromise();
  request.onsuccess = function(event) {
    goog.asserts.assert(event.newVersion == null, 'Unexpected database update');
    p.resolve();
  };
  request.onerror = shaka.offline.DBEngine.onError_.bind(null, request, p);
  return p;
};


/** @override */
shaka.offline.DBEngine.prototype.initialized = function() {
  return this.db_ != null;
};


/** @override */
shaka.offline.DBEngine.prototype.init = function(storeMap, opt_retryCount) {
  goog.asserts.assert(!this.db_, 'Already initialized');

  return this.createConnection_(storeMap, opt_retryCount).then(function() {
    // For each store, get the next ID and store in the map.
    var stores = Object.keys(storeMap);
    return Promise.all(stores.map(function(store) {
      return this.getNextId_(store).then(function(id) {
        this.currentIdMap_[store] = id;
      }.bind(this));
    }.bind(this)));
  }.bind(this));
};


/** @override */
shaka.offline.DBEngine.prototype.destroy = function() {
  return Promise.all(this.operations_.map(function(op) {
    try {
      // If the transaction is considered finished but has not called the
      // callbacks yet, it will still be in the list and this call will fail.
      // Simply ignore errors.
      op.transaction.abort();
    } catch (e) {}

    var Functional = shaka.util.Functional;
    return op.promise.catch(Functional.noop);
  })).then(function() {
    goog.asserts.assert(this.operations_.length == 0,
                        'All operations should have been closed');
    if (this.db_) {
      this.db_.close();
      this.db_ = null;
    }
  }.bind(this));
};


/** @override */
shaka.offline.DBEngine.prototype.get = function(storeName, key) {
  var request;
  return this.createTransaction_(storeName, 'readonly', function(store) {
    request = store.get(key);
  }).then(function() { return request.result; });
};


/** @override */
shaka.offline.DBEngine.prototype.forEach = function(storeName, callback) {
  return this.createTransaction_(storeName, 'readonly', function(store) {
    var request = store.openCursor();
    request.onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        callback(cursor.value);
        cursor.continue();
      }
    };
  });
};


/** @override */
shaka.offline.DBEngine.prototype.insert = function(storeName, value) {
  return this.createTransaction_(storeName, 'readwrite', function(store) {
    store.put(value);
  });
};


/** @override */
shaka.offline.DBEngine.prototype.remove = function(storeName, key) {
  return this.createTransaction_(storeName, 'readwrite', function(store) {
    store.delete(key);
  });
};


/** @override */
shaka.offline.DBEngine.prototype.removeKeys = function(storeName,
                                                       keys,
                                                       opt_onKeyRemoved) {
  return this.createTransaction_(storeName, 'readwrite', function(store) {
    for (var i = 0; i < keys.length; i++) {
      var request = store.delete(keys[i]);
      request.onsuccess = opt_onKeyRemoved || function(event) { };
    }
  });
};


/** @override */
shaka.offline.DBEngine.prototype.reserveId = function(storeName) {
  goog.asserts.assert(storeName in this.currentIdMap_,
                      'Store name must be passed to init()');
  return this.currentIdMap_[storeName]++;
};


/**
 * Gets the ID to start at.
 *
 * @param {string} storeName
 * @return {!Promise.<number>}
 * @private
 */
shaka.offline.DBEngine.prototype.getNextId_ = function(storeName) {
  var id = 0;
  return this.createTransaction_(storeName, 'readonly', function(store) {
    var request = store.openCursor(null, 'prev');
    request.onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        id = cursor.key + 1;
      }
    };
  }).then(function() { return id; });
};


/**
 * Creates a new transaction for the given store name and calls |action| to
 * modify the store. The transaction will resolve or reject the promise
 * returned by this function.
 *
 * @param {string} storeName
 * @param {string} type
 * @param {!function(IDBObjectStore)} action
 *
 * @return {!Promise}
 * @private
 */
shaka.offline.DBEngine.prototype.createTransaction_ = function(storeName,
                                                               type,
                                                               action) {

  goog.asserts.assert(this.db_, 'DBEngine must not be destroyed');
  goog.asserts.assert(type == 'readonly' || type == 'readwrite',
                      'Type must be "readonly" or "readwrite"');

  var op = {
    transaction: this.db_.transaction([storeName], type),
    promise: new shaka.util.PublicPromise()
  };

  op.transaction.oncomplete = (function(event) {
    this.closeOperation_(op);
    op.promise.resolve();
  }.bind(this));

  // We will see an onabort call via:
  //   1. request error -> transaction error -> transaction abort
  //   2. transaction commit fail -> transaction abort
  // As any transaction error will result in an abort, it is better to listen
  // for an abort so that we will catch all failed transaction operations.
  op.transaction.onabort = (function(event) {
    this.closeOperation_(op);
    shaka.offline.DBEngine.onError_(op.transaction, op.promise, event);
  }.bind(this));

  // We need to prevent default on the onerror event or else Firefox will
  // raise an error which will cause a karma failure. This will not stop the
  // onabort callback from firing.
  op.transaction.onerror = (function(event) {
    event.preventDefault();
  }.bind(this));

  var store = op.transaction.objectStore(storeName);
  action(store);

  this.operations_.push(op);

  return op.promise;
};


/**
 * Close an open operation.
 *
 * @param {!shaka.offline.DBEngine.Operation} op
 * @private
 */
shaka.offline.DBEngine.prototype.closeOperation_ = function(op) {
  var i = this.operations_.indexOf(op);
  goog.asserts.assert(i >= 0, 'Operation must be in the list.');
  this.operations_.splice(i, 1);
};


/**
 * Creates a new connection to the database.
 *
 * On IE/Edge, it is possible for the database to not be deleted when the
 * success callback is fired.  This means that when we delete the database and
 * immediately create a new connection, we will connect to the old database.
 * If this happens, we need to close the connection and retry.
 *
 * @see https://goo.gl/hOYJvN
 *
 * @param {!Object.<string, string>} storeMap
 * @param {number=} opt_retryCount
 * @return {!Promise}
 * @private
 */
shaka.offline.DBEngine.prototype.createConnection_ = function(
    storeMap, opt_retryCount) {
  var DBEngine = shaka.offline.DBEngine;

  var indexedDB = window.indexedDB;
  var request = indexedDB.open(DBEngine.DB_NAME_, DBEngine.DB_VERSION_);

  var upgraded = false;
  var createPromise = new shaka.util.PublicPromise();
  request.onupgradeneeded = function(event) {
    upgraded = true;
    var db = event.target.result;
    goog.asserts.assert(event.oldVersion == 0,
                        'Must be upgrading from version 0');
    goog.asserts.assert(db.objectStoreNames.length == 0,
                        'Version 0 database should be empty');
    for (var name in storeMap) {
      db.createObjectStore(name, {keyPath: storeMap[name]});
    }
  };
  request.onsuccess = (function(event) {
    if (opt_retryCount && !upgraded) {
      event.target.result.close();

      shaka.log.info('Didn\'t get an upgrade event... trying again.');
      setTimeout(function() {
        var p = this.createConnection_(storeMap, opt_retryCount - 1);
        p.then(createPromise.resolve, createPromise.reject);
      }.bind(this), 1000);
      return;
    }


    goog.asserts.assert(opt_retryCount == undefined || upgraded,
                        'Should get upgrade event');
    this.db_ = event.target.result;
    createPromise.resolve();
  }.bind(this));
  request.onerror = DBEngine.onError_.bind(null, request, createPromise);

  return createPromise;
};


/**
 * Rejects the given Promise using the error fromt the transaction.
 *
 * @param {!IDBTransaction|!IDBRequest} errorSource
 * @param {!shaka.util.PublicPromise} promise
 * @param {Event} event
 * @private
 */
shaka.offline.DBEngine.onError_ = function(errorSource, promise, event) {

  if (errorSource.error) {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR, errorSource.error));
  } else {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED));
  }

  // Firefox will raise an error which will cause a karma failure.
  event.preventDefault();
};

