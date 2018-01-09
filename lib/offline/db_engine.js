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
goog.require('shaka.offline.DBUpgrade');
goog.require('shaka.offline.DBUpgradeFromVersion0');
goog.require('shaka.offline.DBUpgradeFromVersion1');
goog.require('shaka.offline.DBUtils');
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


/** @private @const {number} */
shaka.offline.DBEngine.DB_VERSION_ = 2;


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

  return Promise.resolve().then(function() {
    return shaka.offline.DBUtils.open(
        name,
        shaka.offline.DBEngine.DB_VERSION_,
        shaka.offline.DBEngine.onUpgrade,
        opt_updateRetries);
  }).then(function(db) {
    this.db_ = db;
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
shaka.offline.DBEngine.prototype.getManifest = function(key) {
  return this.get_(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      key);
};


/** @override */
shaka.offline.DBEngine.prototype.forEachManifest = function(each) {
  return this.forEach_(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      each);
};


/** @override */
shaka.offline.DBEngine.prototype.addManifest = function(value) {
  return this.add_(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.updateManifest = function(key, value) {
  return this.update_(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      key,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.removeManifests =
    function(keys, onKeyRemoved) {
  return this.remove_(
      shaka.offline.DBUtils.StoreV2.MANIFEST,
      keys,
      onKeyRemoved);
};


/** @override */
shaka.offline.DBEngine.prototype.getSegment = function(key) {
  return this.get_(
      shaka.offline.DBUtils.StoreV2.SEGMENT,
      key);
};


/** @override */
shaka.offline.DBEngine.prototype.forEachSegment = function(each) {
  return this.forEach_(
      shaka.offline.DBUtils.StoreV2.SEGMENT,
      each);
};


/** @override */
shaka.offline.DBEngine.prototype.addSegment = function(value) {
  return this.add_(
      shaka.offline.DBUtils.StoreV2.SEGMENT,
      value);
};


/** @override */
shaka.offline.DBEngine.prototype.removeSegments =
    function(keys, onKeyRemoved) {
  return this.remove_(
      shaka.offline.DBUtils.StoreV2.SEGMENT,
      keys,
      onKeyRemoved);
};


/**
 * @param {shaka.offline.DBUtils.StoreV2} store
 * @param {number} key
 * @return {!Promise<T>}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.get_ = function(store, key) {
  /** @const */
  var READ_ONLY = shaka.offline.DBUtils.Mode.READ_ONLY;

  /** @type {IDBRequest} */
  var request;
  return this.createTransaction_(store, READ_ONLY, function(store) {
    request = store.get(key);
  }).then(function() { return request.result; });
};


/**
 * @param {shaka.offline.DBUtils.StoreV2} store
 * @param {function(number, T)} each
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.forEach_ = function(store, each) {
  /** @const */
  var READ_ONLY = shaka.offline.DBUtils.Mode.READ_ONLY;

  /** @const */
  var noop = function() {};

  return this.createTransaction_(store, READ_ONLY, function(store) {
    shaka.offline.DBUtils.forEach(store, function(key, value, next) {
      each(key, value);
      next();
    }, noop);
  });
};


/**
 * @param {shaka.offline.DBUtils.StoreV2} store
 * @param {number} key
 * @param {T} value
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.update_ = function(store, key, value) {
  /** @const */
  var READ_WRITE = shaka.offline.DBUtils.Mode.READ_WRITE;

  return this.createTransaction_(store, READ_WRITE, function(store) {
    store.put(value, key);
  });
};


/**
 * @param {shaka.offline.DBUtils.StoreV2} store
 * @param {T} value
 * @return {!Promise<number>}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.add_ = function(store, value) {
  /** @const */
  var READ_WRITE = shaka.offline.DBUtils.Mode.READ_WRITE;

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
 * @param {shaka.offline.DBUtils.StoreV2} store
 * @param {!Array<number>} keys
 * @param {?function(number)} onKeyRemoved
 * @return {!Promise}
 * @template T
 * @private
 */
shaka.offline.DBEngine.prototype.remove_ = function(store, keys, onKeyRemoved) {
  /** @const */
  var READ_WRITE = shaka.offline.DBUtils.Mode.READ_WRITE;

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
  var READ_ONLY = shaka.offline.DBUtils.Mode.READ_ONLY;
  /** @const */
  var READ_WRITE = shaka.offline.DBUtils.Mode.READ_WRITE;

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

  // We need to prevent default on the onerror event or else Firefox will
  // raise an error which will cause a karma failure. This will not stop the
  // onabort callback from firing.
  op.transaction.onerror = function(event) {
    event.preventDefault();
  };

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
 * @param {number} oldVersion
 * @param {!IDBDatabase} db
 * @param {!IDBTransaction} transaction
 */
shaka.offline.DBEngine.onUpgrade = function(oldVersion, db, transaction) {
  /** @const {number} */
  var currentVersion = shaka.offline.DBEngine.DB_VERSION_;

  shaka.log.v1('Upgrading database from version ' + oldVersion +
      ' to version ' + currentVersion);

  /** @type {!Object.<number, !shaka.offline.DBUpgrade>} */
  var upgraders = {
    0: new shaka.offline.DBUpgradeFromVersion0(),
    1: new shaka.offline.DBUpgradeFromVersion1()
  };

  /** @type {shaka.offline.DBUpgrade} */
  var upgrader = upgraders[oldVersion];

  if (upgrader) {
    upgrader.upgrade(db, transaction);
  } else {
    var failureMessage = 'Attemping to upgrade from version ' + oldVersion +
                         ' which is not supported. To use offline, please' +
                         ' delete the offline storage.';
    throw new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.INDEXED_DB_ERROR,
        failureMessage);
  }
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
