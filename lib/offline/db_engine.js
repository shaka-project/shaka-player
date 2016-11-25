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
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.PublicPromise');



/**
 * This manages all operations on an IndexedDB.  This wraps all operations
 * in Promises.  All Promises will resolve once the transaction has completed.
 * Depending on the browser, this may or may not be after the data is flushed
 * to disk.  https://goo.gl/zMOeJc
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.DBEngine = function() {
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


/**
 * Gets whether the DBEngine is initialized.
 *
 * @return {boolean}
 */
shaka.offline.DBEngine.prototype.initialized = function() {
  return this.db_ != null;
};


/**
 * Initializes the database and creates and required tables.
 *
 * @param {!Object.<string, string>} storeMap
 *   A map of store name to the key path.
 * @return {!Promise}
 */
shaka.offline.DBEngine.prototype.init = function(storeMap) {
  goog.asserts.assert(!this.db_, 'Already initialized');
  var DBEngine = shaka.offline.DBEngine;
  if (!DBEngine.isSupported()) {
    return Promise.reject(
        new shaka.util.Error(
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.INDEXED_DB_NOT_SUPPORTED));
  }

  var indexedDB = window.indexedDB;
  var request = indexedDB.open(DBEngine.DB_NAME_, DBEngine.DB_VERSION_);

  var promise = new shaka.util.PublicPromise();
  request.onupgradeneeded = function(event) {
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
    this.db_ = event.target.result;
    promise.resolve();
  }.bind(this));
  request.onerror = DBEngine.onError_.bind(null, request, promise);

  return promise.then(function() {
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
    if (this.db_) {
      this.db_.close();
      this.db_ = null;
    }
  }.bind(this));
};


/**
 * Gets the item with the given ID in the store.
 *
 * @param {string} storeName
 * @param {number} key
 * @return {!Promise.<T>}
 * @template T
 */
shaka.offline.DBEngine.prototype.get = function(storeName, key) {
  return this.createOperation_(storeName, 'readonly', function(store) {
    return store.get(key);
  });
};


/**
 * Calls the given callback for each value in the store.  The promise will
 * resolve after all items have been traversed.
 *
 * @param {string} storeName
 * @param {function(T)} callback
 * @return {!Promise}
 * @template T
 */
shaka.offline.DBEngine.prototype.forEach = function(storeName, callback) {
  return this.createOperation_(storeName, 'readonly', function(store) {
    return store.openCursor();
  }, function(/** IDBCursor */ cursor) {
    if (!cursor) return;

    callback(cursor.value);
    cursor.continue();
  });
};


/**
 * Adds or updates the given value in the store.
 *
 * @param {string} storeName
 * @param {!Object} value
 * @return {!Promise}
 */
shaka.offline.DBEngine.prototype.insert = function(storeName, value) {
  return this.createOperation_(storeName, 'readwrite', function(store) {
    return store.put(value);
  });
};


/**
 * Removes the item with the given key.
 *
 * @param {string} storeName
 * @param {number} key
 * @return {!Promise}
 */
shaka.offline.DBEngine.prototype.remove = function(storeName, key) {
  return this.createOperation_(storeName, 'readwrite', function(store) {
    return store.delete(key);
  });
};


/**
 * Removes all items for which the given predicate returns true.
 *
 * @param {string} storeName
 * @param {function(T):boolean} callback
 * @return {!Promise.<number>}
 * @template T
 */
shaka.offline.DBEngine.prototype.removeWhere = function(storeName, callback) {
  var async = [];
  return this.createOperation_(storeName, 'readwrite', function(store) {
    return store.openCursor();
  }, function(/** IDBCursor */ cursor) {
    if (!cursor) return;

    if (callback(cursor.value)) {
      var request = cursor.delete();
      var p = new shaka.util.PublicPromise();
      request.onsuccess = p.resolve;
      request.onerror = shaka.offline.DBEngine.onError_.bind(null, request, p);
      async.push(p);
    }
    cursor.continue();
  }).then(function() {
    return Promise.all(async);
  }).then(function() {
    return async.length;
  });
};


/**
 * Reserves the next ID and returns it.
 *
 * @param {string} storeName
 * @return {number}
 */
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
  var ret = 0;
  return this.createOperation_(storeName, 'readonly', function(store) {
    return store.openCursor(null, 'prev');
  }, function(/** IDBCursor */ cursor) {
    if (cursor)
      ret = cursor.key + 1;
  }).then(function() { return ret; });
};


/**
 * Creates a new transaction for the given store name and calls the given
 * callback to create a request.  It then wraps the given request in an
 * operation and returns the resulting promise.  The Promise resolves when
 * the transaction is complete, which will be after opt_success is called.
 *
 * @param {string} storeName
 * @param {string} type
 * @param {function(!IDBObjectStore):!IDBRequest} createRequest
 * @param {(function(*))=} opt_success The value of onsuccess for the request.
 * @return {!Promise}
 * @private
 */
shaka.offline.DBEngine.prototype.createOperation_ = function(
    storeName, type, createRequest, opt_success) {
  goog.asserts.assert(this.db_, 'Must not be destroyed');
  goog.asserts.assert(type == 'readonly' || type == 'readwrite',
                      'Type must be "readonly" or "readwrite"');

  var trans = this.db_.transaction([storeName], type);
  var request = createRequest(trans.objectStore(storeName));

  var p = new shaka.util.PublicPromise();
  if (opt_success)
    request.onsuccess = function(event) { opt_success(event.target.result); };
  request.onerror = shaka.offline.DBEngine.onError_.bind(null, request, p);

  var op = {transaction: trans, promise: p};
  this.operations_.push(op);

  // Only remove the transaction once it has completed, which may be after the
  // request is complete (e.g. it may need to write to disk).
  var removeOp = (function() {
    var i = this.operations_.indexOf(op);
    goog.asserts.assert(i >= 0, 'Operation must be in the list.');
    this.operations_.splice(i, 1);
  }.bind(this));
  trans.oncomplete = function(event) {
    removeOp();
    p.resolve(request.result);
  };
  trans.onerror = function(event) {
    removeOp();
    shaka.offline.DBEngine.onError_(request, p, event);
  };
  return p;
};


/**
 * Rejects the given Promise with an unknown error.
 *
 * @param {!IDBRequest} request
 * @param {!shaka.util.PublicPromise} promise
 * @param {Event} event
 * @private
 */
shaka.offline.DBEngine.onError_ = function(request, promise, event) {
  if (request.error.name == 'AbortError') {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED));
  } else {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR, request.error));
  }

  // Firefox will raise an error which will cause a karma failure.
  event.preventDefault();
};

