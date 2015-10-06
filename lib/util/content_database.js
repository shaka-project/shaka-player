/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.util.ContentDatabase');

goog.require('shaka.asserts');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');



/**
 * Creates a new ContentDatabase, which manages a database for reading and
 * writing streams to and from persistent storage.
 *
 * @param {string} mode The I/O mode, which must be either 'readonly' or
 *     'readwrite'.
 * @param {shaka.util.FakeEventTarget} parent
 *
 * @constructor
 * @struct
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.util.ContentDatabase = function(mode, parent) {
  shaka.asserts.assert(mode == 'readonly' || mode == 'readwrite');

  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {IDBDatabase} */
  this.db_ = null;

  /** @private {string} */
  this.mode_ = mode;
};
goog.inherits(shaka.util.ContentDatabase, shaka.util.FakeEventTarget);


/**
 * The name of the IndexedDb instance.
 *
 * @const {string}
 */
shaka.util.ContentDatabase.DB_NAME = 'content_database';


/**
 * The current version of the database.
 *
 * @private {number}
 * @const
 */
shaka.util.ContentDatabase.DB_VERSION_ = 1;


/**
 * The name of the group store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.GROUP_STORE_ = 'group_store';


/**
 * The name of the index store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.INDEX_STORE_ = 'stream_index_store';


/**
 * The name of the content store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.CONTENT_STORE_ = 'content_store';


/**
 * @typedef {{
 *    group_id: number,
 *    stream_ids: !Array.<number>,
 *    session_ids: !Array.<string>,
 *    duration: ?number,
 *    key_system: string,
 *    license_server: string,
 *    with_credentials: boolean,
 *    distinctive_identifier: boolean,
 *    audio_robustness: string,
 *    video_robustness: string
 *  }}
 */
shaka.util.ContentDatabase.GroupInformation;


/**
 * @typedef {{
 *    stream_id: number,
 *    mime_type: string,
 *    codecs: string,
 *    init_segment: ArrayBuffer,
 *    references: !Array.<shaka.util.ContentDatabase.SegmentInformation>
 *  }}
 */
shaka.util.ContentDatabase.StreamIndex;


/**
 * @typedef {{
 *    index: number,
 *    start_time: number,
 *    end_time: number,
 *    start_byte: number,
 *    url: string
 *  }}
 */
shaka.util.ContentDatabase.SegmentInformation;


/**
 * Opens a connection to the database and sets up the database if required. If
 * a new version number is given the onupgradeneeded event will be fired. Must
 * be run before any operations can be performed on the database.
 * The database will have the structure:
 * Group Store: {
 *    group_id: number
 *    stream_ids: Array.<number>
 *    session_ids: Array.<string>
 * }
 * Index Store: {
 *    stream_id: number,
 *    mime_type: string,
 *    references: [{shaka.util.ContentDatabase.SegmentInformation}]
 * }
 * Content Store: {
 *    stream_id: number,
 *    segment_id: number,
 *    content: ArrayBuffer
 * }
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.setUpDatabase = function() {
  if (!window.indexedDB) {
    var error = new Error('Persistant storage requires IndexedDB support.');
    error.type = 'storage';
    return Promise.reject(error);
  }

  if (this.db_) {
    var error = new Error('A database connection is already open.');
    error.type = 'storage';
    return Promise.reject(error);
  }

  var p = new shaka.util.PublicPromise();
  var indexedDB = window.indexedDB;
  var request = indexedDB.open(shaka.util.ContentDatabase.DB_NAME,
                               shaka.util.ContentDatabase.DB_VERSION_);

  request.onupgradeneeded = shaka.util.TypedBind(this,
      /** @param {!Event} e */
      function(e) {
        this.db_ = e.target.result;

        this.createStore_(
            shaka.util.ContentDatabase.GROUP_STORE_, {keyPath: 'group_id'});
        this.createStore_(
            shaka.util.ContentDatabase.INDEX_STORE_, {keyPath: 'stream_id'});
        var contentStore = this.createStore_(
            shaka.util.ContentDatabase.CONTENT_STORE_, {autoIncrement: 'true'});

        contentStore.createIndex('segment',
                                 ['stream_id', 'segment_id'],
                                 {unique: true});
        contentStore.createIndex('stream',
                                 'stream_id',
                                 {unique: false});
      });

  request.onsuccess = shaka.util.TypedBind(this,
      /** @param {!Event} e */
      function(e) {
        this.db_ = e.target.result;
        p.resolve();
      });

  request.onerror = function(e) { p.reject(request.error); };
  return p;
};


/**
 * Closes the connection to the database.
 */
shaka.util.ContentDatabase.prototype.closeDatabaseConnection = function() {
  if (this.db_) {
    this.db_.close();
    this.db_ = null;
  }
};


/**
 * Closes the connection to the database if required and then deletes the
 * database. The database can only be deleted if there are no other connections
 * to the database.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteDatabase = function() {
  var p = new shaka.util.PublicPromise();
  this.closeDatabaseConnection();
  var deleteRequest = window.indexedDB.deleteDatabase(
      shaka.util.ContentDatabase.DB_NAME);

  deleteRequest.onsuccess = function(e) {
    shaka.asserts.assert(e.newVersion == null);
    p.resolve();
  };
  deleteRequest.onerror = function(e) { p.reject(deleteRequest.error); };
  return p;
};


/**
 * Creates an object store in the database. It will replace any previous object
 * store with the same name in this database.
 * @param {string} name The unique name of the object store.
 * @param {Object} options The options for this object store including
 *    keyPath and autoIncrement, other options will be ignored.
 * @return {!IDBObjectStore}
 * @private
 */
shaka.util.ContentDatabase.prototype.createStore_ = function(name, options) {
  if (this.db_.objectStoreNames.contains(name)) {
    this.db_.deleteObjectStore(name);
  }
  return this.db_.createObjectStore(name, options);
};


/**
 * Opens a reference to the content store.
 * @return {!IDBObjectStore} A reference to the content store.
 * @protected
 */
shaka.util.ContentDatabase.prototype.getContentStore = function() {
  return this.getStore_(shaka.util.ContentDatabase.CONTENT_STORE_);
};


/**
 * Opens a reference to the index store.
 * @return {!IDBObjectStore} A reference to the index store.
 * @protected
 */
shaka.util.ContentDatabase.prototype.getIndexStore = function() {
  return this.getStore_(shaka.util.ContentDatabase.INDEX_STORE_);
};


/**
 * Opens a reference to the group store.
 * @return {!IDBObjectStore} A reference to the group store.
 * @protected
 */
shaka.util.ContentDatabase.prototype.getGroupStore = function() {
  return this.getStore_(shaka.util.ContentDatabase.GROUP_STORE_);
};


/**
 * Opens a reference to a store.
 * @param {string} storeName The name of a store in the database.
 * @return {!IDBObjectStore} A reference to a store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getStore_ = function(storeName) {
  shaka.asserts.assert(this.db_, 'A database connection should be open.');
  var trans = this.db_.transaction([storeName], this.mode_);
  return trans.objectStore(storeName);
};


/**
 * Retrieves an item from a store in the database.
 * @param {!IDBObjectStore|!IDBIndex} store The store to request an item from.
 * @param {number|!Array} id The unique id(s) of item in the store.
 * @return {!Promise}
 * @protected
 */
shaka.util.ContentDatabase.prototype.retrieveItem = function(
    store, id) {
  var p = new shaka.util.PublicPromise();

  var request = store.get(id);

  request.onerror = function(e) { p.reject(request.error); };
  request.onsuccess = function() {
    if (request.result) {
      p.resolve(request.result);
    } else {
      var error = new Error('Item not found.');
      error.type = 'storage';
      p.reject(error);
    }
  };

  return p;
};

