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
 * @param {string} name
 * @implements {shaka.offline.IStorageEngine}
 */
shaka.offline.DBEngine = function(name) {
  goog.asserts.assert(
      shaka.offline.DBEngine.isSupported(),
      'DBEngine should not be called when DBEngine is not supported');

  /** @private {string} */
  this.name_ = name;

  /** @private {IDBDatabase} */
  this.db_ = null;

  /** @private {!Array.<shaka.offline.DBEngine.Operation>} */
  this.operations_ = [];
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


/**
 * The name for the stores that are used in the version 3 of our
 * indexed db storage.
 *
 * @enum {string}
 */
shaka.offline.DBEngine.Store = {
  MANIFEST: 'manifest-v3',
  SEGMENT: 'segment-v3'
};


/**
 * @enum {string}
 */
shaka.offline.DBEngine.Mode = {
  READ_ONLY: 'readonly',
  READ_WRITE: 'readwrite'
};


/** @private @const {number} */
shaka.offline.DBEngine.DB_VERSION_ = 3;


/**
 * Determines if the browsers supports IndexedDB.
 * @return {boolean}
 */
shaka.offline.DBEngine.isSupported = function() {
  return window.indexedDB != null;
};


/**
 * Delete the database.  There must be no open connections to the database.
 * @param {string} name
 * @return {!Promise}
 */
shaka.offline.DBEngine.deleteDatabase = function(name) {
  if (!window.indexedDB)
    return Promise.resolve();
  var request = window.indexedDB.deleteDatabase(name);

  var p = new shaka.util.PublicPromise();
  request.onsuccess = function(event) {
    goog.asserts.assert(event.newVersion == null, 'Unexpected database update');
    p.resolve();
  };
  request.onerror = shaka.offline.DBEngine.onError_.bind(null, request, p);
  return p;
};


/**
 * @param {number=} opt_updateRetries The number of times to init the database
 *                                    expecting an upgrade. If an upgrade does
 *                                    not happen, the init will fail.
 * @return {!Promise}
 */
shaka.offline.DBEngine.prototype.init = function(opt_updateRetries) {
  var name = this.name_;
  var version = shaka.offline.DBEngine.DB_VERSION_;

  return shaka.offline.DBEngine.open_(name, version, opt_updateRetries)
      .then(function(db) { this.db_ = db; }.bind(this));
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
shaka.offline.DBEngine.prototype.getManifest = function(key) {
  return this.get_(
      shaka.offline.DBEngine.Store.MANIFEST,
      key);
};


/** @override */
shaka.offline.DBEngine.prototype.forEachManifest = function(each) {
  return this.forEach_(
      shaka.offline.DBEngine.Store.MANIFEST,
      each);
};


/** @override */
shaka.offline.DBEngine.prototype.addManifest = function(value) {
  return this.add_(
      shaka.offline.DBEngine.Store.MANIFEST,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.updateManifest = function(key, value) {
  return this.update_(
      shaka.offline.DBEngine.Store.MANIFEST,
      key,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.removeManifests =
    function(keys, onKeyRemoved) {
  return this.remove_(
      shaka.offline.DBEngine.Store.MANIFEST,
      keys,
      onKeyRemoved);
};


/** @override */
shaka.offline.DBEngine.prototype.getSegment = function(key) {
  return this.get_(
      shaka.offline.DBEngine.Store.SEGMENT,
      key);
};


/** @override */
shaka.offline.DBEngine.prototype.forEachSegment = function(each) {
  return this.forEach_(
      shaka.offline.DBEngine.Store.SEGMENT,
      each);
};


/** @override */
shaka.offline.DBEngine.prototype.addSegment = function(value) {
  return this.add_(
      shaka.offline.DBEngine.Store.SEGMENT,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.removeSegments =
    function(keys, onKeyRemoved) {
  return this.remove_(
      shaka.offline.DBEngine.Store.SEGMENT,
      keys,
      onKeyRemoved);
};


/**
 * @param {shaka.offline.DBEngine.Store} store
 * @param {number} key
 * @return {!Promise<T>}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.get_ = function(store, key) {
  /** @const */
  var READ_ONLY = shaka.offline.DBEngine.Mode.READ_ONLY;

  /** @type {IDBRequest} */
  var request;
  return this.createTransaction_(store, READ_ONLY, function(store) {
    request = store.get(key);
  }).then(function() { return request.result; });
};


/**
 * @param {shaka.offline.DBEngine.Store} storeName
 * @param {function(number, T)} each
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.forEach_ = function(storeName, each) {
  /** @const */
  var READ_ONLY = shaka.offline.DBEngine.Mode.READ_ONLY;

  return this.createTransaction_(storeName, READ_ONLY, function(store) {
    store.openCursor().onsuccess = function(event) {
      /** @type {IDBCursor} */
      var cursor = event.target.result;
      // When we reach the end of the data that the cursor is iterating
      // over, |event.target.result| will be null to signal the end of the
      // iteration.
      // https://developer.mozilla.org/en-US/docs/Web/API/IDBCursor/continue
      if (!cursor) {
        return;
      }

      /** @type {number} */
      var key = /** @type {number} */ (cursor.key);
      /** @type {Object} */
      var value = /** @type {Object} */ (cursor.value);

      each(key, value);

      cursor.continue();
    };
  });
};


/**
 * @param {shaka.offline.DBEngine.Store} store
 * @param {number} key
 * @param {T} value
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.update_ = function(store, key, value) {
  /** @const */
  var READ_WRITE = shaka.offline.DBEngine.Mode.READ_WRITE;

  return this.createTransaction_(store, READ_WRITE, function(store) {
    store.put(value, key);
  });
};


/**
 * @param {shaka.offline.DBEngine.Store} store
 * @param {T} value
 * @return {!Promise<number>}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.add_ = function(store, value) {
  /** @const */
  var READ_WRITE = shaka.offline.DBEngine.Mode.READ_WRITE;

  /** @type {number} */
  var key;

  return this.createTransaction_(store, READ_WRITE, function(store) {
    var request = store.add(value);
    request.onsuccess = function(event) {
      key = event.target.result;
    };
  }).then(function() { return key; });
};


/**
 * @param {shaka.offline.DBEngine.Store} store
 * @param {!Array<number>} keys
 * @param {?function(number)} onKeyRemoved
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.remove_ = function(store, keys, onKeyRemoved) {
  /** @const */
  var READ_WRITE = shaka.offline.DBEngine.Mode.READ_WRITE;

  return this.createTransaction_(store, READ_WRITE, function(store) {
    keys.forEach(function(key) {
      /** @type {IDBRequest} */
      var request = store.delete(key);
      request.onsuccess = function() {
        if (onKeyRemoved) {
          onKeyRemoved(key);
        }
      };
    });
  });
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
  /** @const */
  var READ_ONLY = shaka.offline.DBEngine.Mode.READ_ONLY;
  /** @const */
  var READ_WRITE = shaka.offline.DBEngine.Mode.READ_WRITE;

  /** @type {!shaka.offline.DBEngine} */
  var self = this;

  goog.asserts.assert(self.db_, 'DBEngine must not be destroyed');
  goog.asserts.assert(type == READ_ONLY || type == READ_WRITE,
                      'Unexpected transaction type.');

  var op = {
    transaction: self.db_.transaction([storeName], type),
    promise: new shaka.util.PublicPromise()
  };

  op.transaction.oncomplete = function(event) {
    self.closeOperation_(op);
    op.promise.resolve();
  };

  // We will see an onabort call via:
  //   1. request error -> transaction error -> transaction abort
  //   2. transaction commit fail -> transaction abort
  // As any transaction error will result in an abort, it is better to listen
  // for an abort so that we will catch all failed transaction operations.
  op.transaction.onabort = function(event) {
    self.closeOperation_(op);
    shaka.offline.DBEngine.onError_(op.transaction, op.promise, event);
  };

  op.transaction.onerror = shaka.offline.DBEngine.quietEventHandler_();

  var store = op.transaction.objectStore(storeName);
  action(store);

  self.operations_.push(op);

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
 * @param {!shaka.util.PublicPromise} promise
 * @param {number} oldVersion
 * @param {!IDBDatabase} db
 * @param {!IDBTransaction} transaction
 * @private
 */
shaka.offline.DBEngine.onUpgrade_ = function(promise,
                                             oldVersion,
                                             db,
                                             transaction) {
  /** @const {!IDBObjectStoreParameters} */
  var storeSettings = {autoIncrement: true};

  var Store = shaka.offline.DBEngine.Store;

  // We are upgrading from an empty database, this is good, we can handle this.
  if (oldVersion == 0) {
    db.createObjectStore(Store.MANIFEST, storeSettings);
    db.createObjectStore(Store.SEGMENT, storeSettings);
  } else {
    shaka.offline.DBEngine.rejectUpgrade_(promise, db, transaction);
  }
};


/**
 * Reject the current upgrade transaction.
 * @param {!shaka.util.PublicPromise} promise
 * @param {!IDBDatabase} db
 * @param {!IDBTransaction} transaction
 * @private
 */
shaka.offline.DBEngine.rejectUpgrade_ = function(promise, db, transaction) {
  // Make a list of all the stores that we need to check the uris from.
  var stores = ['manifest', 'manifest-v2'].filter(function(name) {
    return db.objectStoreNames.contains(name);
  });

  /** @type {!Array.<string>} */
  var uris = [];

  var addUrisFromStore = function(name, next) {
    transaction.objectStore(name).openCursor().onsuccess = function(event) {
      var cursor = event.target.result;
      if (cursor) {
        var content = cursor.value;
        uris.push(content.originalManifestUri);

        cursor.continue();
      } else {
        next();
      }
    };
  };

  // Collect all the uris from the next store. If there are no more stores
  // this will terminate the series and call |end|.
  var next = function() {
    var name = stores.pop();
    if (name) {
      addUrisFromStore(name, next);
    } else {
      // Send back a special rejection because the app can recover from this if
      // they opt to delete the database.
      promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.UNSUPPORTED_UPGRADE_REQUEST,
          uris));

      // Abort after the rejection or else the |onerror| handler on the request
      // will reject first.
      transaction.abort();
    }
  };

  // Start reading through all the stores.
  next();
};


/**
 * Rejects the given Promise using the error fromt the transaction.
 *
 * @param {!IDBTransaction|!IDBRequest} errorSource
 * @param {!shaka.util.PublicPromise} promise
 * @param {!Event} event
 * @private
 */
shaka.offline.DBEngine.onError_ = function(errorSource, promise, event) {

  var error;

  if (errorSource.error) {
    error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        errorSource.error);
  } else {
    error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.OPERATION_ABORTED);
  }

  promise.reject(error);

  // Firefox will raise an error which will cause a karma failure.
  event.preventDefault();
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
 * @param {number=} opt_updateRetries
 * @return {!Promise.<!IDBDatabase>}
 * @private
 */
shaka.offline.DBEngine.open_ = function(name, version, opt_updateRetries) {
  var tryOpen = shaka.offline.DBEngine.tryOpen_;

  /** @type {number} */
  var retries = opt_updateRetries || 0;

  var wait = function() {
    var wait = 1000; // 1 second
    return new Promise(function(resolve) { setTimeout(resolve, wait); });
  };

  var forceUpgrade = retries > 0;
  var chain = shaka.offline.DBEngine.tryOpen_(name, version, forceUpgrade);

  for (let i = 0; i < retries; i++) {
    chain = chain.then(function(db) {
      if (db) { return db; }
      return wait().then(function() {
        return tryOpen(name, version, forceUpgrade);
      });
    });
  }

  return chain.then(function(db) {
    if (db) { return db; }

    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        'Failed to issue upgrade after ' + retries + ' retries'));
  });
};


/**
 * Try and open a connection to indexeddb. If an upgrade is needed, and
 * the connection opens without an upgrade, the connection will be closed
 * and the promise will be resolved with null. Otherwise the promise will be
 * resolve with the connection.
 *
 * @param {string} name
 * @param {number} version
 * @param {boolean} needUpgrade
 * @return {!Promise.<IDBDatabase>}
 * @private
 */
shaka.offline.DBEngine.tryOpen_ = function(name, version, needUpgrade) {
  /** @type {!shaka.util.PublicPromise} */
  var promise = new shaka.util.PublicPromise();

  var upgraded = false;

  var request = window.indexedDB.open(name, version);
  request.onupgradeneeded = function(event) {
    var oldVersion = event.oldVersion;
    var transaction = event.target.transaction;
    var db = transaction.db;

    shaka.offline.DBEngine.onUpgrade_(promise, oldVersion, db, transaction);
    upgraded = true;
  };

  request.onsuccess = function(event) {
    /** @type {IDBDatabase} */
    var db = event.target.result;

    if (needUpgrade && !upgraded) {
      db.close();
      promise.resolve(null);
    } else {
      promise.resolve(db);
    }
  };

  request.onerror = shaka.offline.DBEngine.quietEventHandler_(function() {
    promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        'Failed to open IndexedDB Connection',
        request.error.message));
  });

  return promise;
};


/**
 * Wrap an event listener so that it will prevent Firefox from raising an
 * error that will cause karma to fail. This will not stop other callback
 * from firing.
 *
 * @param {function(*)=} opt_func
 * @return {function(*)}
 * @private
 */
shaka.offline.DBEngine.quietEventHandler_ = function(opt_func) {
  return function(event) {
    event.preventDefault();

    if (opt_func) {
      opt_func(event);
    }
  };
};
