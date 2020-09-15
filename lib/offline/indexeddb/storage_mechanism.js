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

goog.provide('shaka.offline.indexeddb.StorageMechanism');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.offline.StorageMuxer');
goog.require('shaka.offline.indexeddb.EmeSessionStorageCell');
goog.require('shaka.offline.indexeddb.V1StorageCell');
goog.require('shaka.offline.indexeddb.V2StorageCell');
goog.require('shaka.util.Error');
goog.require('shaka.util.PublicPromise');


/**
 * A storage mechanism to manage storage cells for an indexed db instance.
 * The cells are just for interacting with the stores that are found in the
 * database instance. The mechanism is responsible for creating new stores
 * when opening the database. If the database is too old of a version, a
 * cell will be added for the old stores but the cell won't support add
 * operations. The mechanism will create the new versions of the stores and
 * will allow add operations for those stores.
 *
 * @implements {shaka.extern.StorageMechanism}
 */
shaka.offline.indexeddb.StorageMechanism = class {
  constructor() {
    /** @private {IDBDatabase} */
    this.db_ = null;

    /** @private {shaka.extern.StorageCell} */
    this.v1_ = null;
    /** @private {shaka.extern.StorageCell} */
    this.v2_ = null;
    /** @private {shaka.extern.StorageCell} */
    this.v3_ = null;
    /** @private {shaka.extern.EmeSessionStorageCell} */
    this.sessions_ = null;
  }

  /**
   * @override
   */
  init() {
    const name = shaka.offline.indexeddb.StorageMechanism.DB_NAME;
    const version = shaka.offline.indexeddb.StorageMechanism.VERSION;

    let p = new shaka.util.PublicPromise();
    let open = window.indexedDB.open(name, version);
    open.onsuccess = (event) => {
      let db = event.target.result;
      this.db_ = db;
      this.v1_ = shaka.offline.indexeddb.StorageMechanism.createV1_(db);
      this.v2_ = shaka.offline.indexeddb.StorageMechanism.createV2_(db);
      this.v3_ = shaka.offline.indexeddb.StorageMechanism.createV3_(db);
      this.sessions_ =
          shaka.offline.indexeddb.StorageMechanism.createEmeSession_(db);
      p.resolve();
    };
    open.onupgradeneeded = (event) => {
      // Add object stores for the latest version only.
      this.createStores_(event.target.result);
    };
    open.onerror = (event) => {
      p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.INDEXED_DB_ERROR,
          open.error));

      // Firefox will raise an error on the main thread unless we stop it here.
      event.preventDefault();
    };

    return p;
  }

  /**
   * @override
   */
  async destroy() {
    if (this.v1_) { await this.v1_.destroy(); }
    if (this.v2_) { await this.v2_.destroy(); }
    if (this.v3_) { await this.v3_.destroy(); }
    if (this.sessions_) { await this.sessions_.destroy(); }

    // If we were never initialized, then |db_| will still be null.
    if (this.db_) { this.db_.close(); }
  }

  /**
   * @override
   */
  getCells() {
    const map = new Map();

    if (this.v1_) { map.set('v1', this.v1_); }
    if (this.v2_) { map.set('v2', this.v2_); }
    if (this.v3_) { map.set('v3', this.v3_); }

    return map;
  }

  /**
   * @override
   */
  getEmeSessionCell() {
    goog.asserts.assert(this.sessions_, 'Cannot be destroyed.');
    return this.sessions_;
  }

  /**
   * @override
   */
  async erase() {
    // Not all cells may have been created, so only destroy the ones that
    // were created.
    if (this.v1_) { await this.v1_.destroy(); }
    if (this.v2_) { await this.v2_.destroy(); }
    if (this.v3_) { await this.v3_.destroy(); }

    // |db_| will only be null if the muxer was not initialized. We need to
    // close the connection in order delete the database without it being
    // blocked.
    if (this.db_) { this.db_.close(); }

    await shaka.offline.indexeddb.StorageMechanism.deleteAll_();

    // Reset before initializing.
    this.db_ = null;
    this.v1_ = null;
    this.v2_ = null;
    this.v3_ = null;

    await this.init();
  }

  /**
   * @param {!IDBDatabase} db
   * @return {shaka.extern.StorageCell}
   * @private
   */
  static createV1_(db) {
    const StorageMechanism = shaka.offline.indexeddb.StorageMechanism;
    const segmentStore = StorageMechanism.V1_SEGMENT_STORE;
    const manifestStore = StorageMechanism.V1_MANIFEST_STORE;
    const stores = db.objectStoreNames;
    if (stores.contains(manifestStore) && stores.contains(segmentStore)) {
      shaka.log.debug('Mounting v1 idb storage cell');

      return new shaka.offline.indexeddb.V1StorageCell(
          db,
          segmentStore,
          manifestStore);
    }
    return null;
  }

  /**
   * @param {!IDBDatabase} db
   * @return {shaka.extern.StorageCell}
   * @private
   */
  static createV2_(db) {
    const StorageMechanism = shaka.offline.indexeddb.StorageMechanism;
    const segmentStore = StorageMechanism.V2_SEGMENT_STORE;
    const manifestStore = StorageMechanism.V2_MANIFEST_STORE;
    const stores = db.objectStoreNames;
    if (stores.contains(manifestStore) && stores.contains(segmentStore)) {
      shaka.log.debug('Mounting v2 idb storage cell');

      return new shaka.offline.indexeddb.V2StorageCell(
          db,
          segmentStore,
          manifestStore,
          true);  // Are keys locked? Yes, this means no new additions.
    }
    return null;
  }

  /**
   * @param {!IDBDatabase} db
   * @return {shaka.extern.StorageCell}
   * @private
   */
  static createV3_(db) {
    const StorageMechanism = shaka.offline.indexeddb.StorageMechanism;
    const segmentStore = StorageMechanism.V3_SEGMENT_STORE;
    const manifestStore = StorageMechanism.V3_MANIFEST_STORE;
    const stores = db.objectStoreNames;
    if (stores.contains(manifestStore) && stores.contains(segmentStore)) {
      shaka.log.debug('Mounting v3 idb storage cell');

      // Version 3 uses the same structure as version 2, so we can use the same
      // cells but it can support new entries.
      return new shaka.offline.indexeddb.V2StorageCell(
          db,
          segmentStore,
          manifestStore,
          false); // Are keys locked? No, this means we can add new entries.
    }
    return null;
  }

  /**
   * @param {!IDBDatabase} db
   * @return {shaka.extern.EmeSessionStorageCell}
   * @private
   */
  static createEmeSession_(db) {
    const StorageMechanism = shaka.offline.indexeddb.StorageMechanism;
    const store = StorageMechanism.SESSION_ID_STORE;
    if (db.objectStoreNames.contains(store)) {
      shaka.log.debug('Mounting session ID idb storage cell');
      return new shaka.offline.indexeddb.EmeSessionStorageCell(db, store);
    }
    return null;
  }

  /**
   * @param {!IDBDatabase} db
   * @private
   */
  createStores_(db) {
    const storeNames = [
      shaka.offline.indexeddb.StorageMechanism.V3_SEGMENT_STORE,
      shaka.offline.indexeddb.StorageMechanism.V3_MANIFEST_STORE,
      shaka.offline.indexeddb.StorageMechanism.SESSION_ID_STORE,
    ];

    for (const name of storeNames) {
      if (!db.objectStoreNames.contains(name)) {
        db.createObjectStore(name, {autoIncrement: true});
      }
    }
  }

  /**
   * Delete the indexed db instance so that all stores are deleted and cleared.
   * This will force the database to a like-new state next time it opens.
   *
   * @return {!Promise}
   * @private
   */
  static deleteAll_() {
    const name = shaka.offline.indexeddb.StorageMechanism.DB_NAME;

    let p = new shaka.util.PublicPromise();

    let del = window.indexedDB.deleteDatabase(name);
    del.onblocked = (event) => {
      shaka.log.warning('Deleting', name, 'is being blocked');
    };
    del.onsuccess = (event) => {
      p.resolve();
    };
    del.onerror = (event) => {
      p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.INDEXED_DB_ERROR,
          del.error));

      // Firefox will raise an error on the main thread unless we stop it here.
      event.preventDefault();
    };

    return p;
  }
};

/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.DB_NAME = 'shaka_offline_db';
/** @const {number} */
shaka.offline.indexeddb.StorageMechanism.VERSION = 4;
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V1_SEGMENT_STORE = 'segment';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V2_SEGMENT_STORE = 'segment-v2';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V3_SEGMENT_STORE = 'segment-v3';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V1_MANIFEST_STORE = 'manifest';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V2_MANIFEST_STORE = 'manifest-v2';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.V3_MANIFEST_STORE = 'manifest-v3';
/** @const {string} */
shaka.offline.indexeddb.StorageMechanism.SESSION_ID_STORE = 'session-ids';


// Since this may be called before the polyfills remove indexeddb support from
// some platforms (looking at you Chromecast), we need to check for support
// when we create the mechanism.
//
// Thankfully the storage muxer api allows us to return a null mechanism
// to indicate that the mechanism is not supported on this platform.
shaka.offline.StorageMuxer.register(
    'idb',
    () => {
      // Offline storage is not supported on the Chromecast platform.
      if (shaka.util.Platform.isChromecast()) {
        return null;
      }
      // Offline storage requires the IndexedDB API.
      if (!window.indexedDB) {
        return null;
      }
      return new shaka.offline.indexeddb.StorageMechanism();
    });
