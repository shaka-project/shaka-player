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

goog.require('shaka.log');
goog.require('shaka.offline.StorageMuxer');
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
 * @implements {shakaExtern.StorageMechanism}
 */
shaka.offline.indexeddb.StorageMechanism = class {
  constructor() {
    /** @private {shakaExtern.StorageCell} */
    this.v1_ = null;
    /** @private {shakaExtern.StorageCell} */
    this.v2_ = null;
    /** @private {shakaExtern.StorageCell} */
    this.v3_ = null;
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
      this.createCells_(event.target.result);
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
  destroy() {
    return Promise.all([
      this.v1_ ? this.v1_.destroy() : Promise.resolve(),
      this.v2_ ? this.v2_.destroy() : Promise.resolve(),
      this.v3_ ? this.v3_.destroy() : Promise.resolve()
    ]);
  }

  /**
   * @override
   */
  getCells() {
    let map = {};

    if (this.v1_) { map['v1'] = this.v1_; }
    if (this.v2_) { map['v2'] = this.v2_; }
    if (this.v3_) { map['v3'] = this.v3_; }

    return map;
  }

  /**
   * @override
   */
  erase() {
    return Promise.all([
      this.v1_ ? this.v1_.destroy() : Promise.resolve(),
      this.v2_ ? this.v2_.destroy() : Promise.resolve(),
      this.v3_ ? this.v3_.destroy() : Promise.resolve()
    ]).then(() => {
      this.v1_ = null;
      this.v2_ = null;
      this.v3_ = null;
      return shaka.offline.indexeddb.StorageMechanism.deleteAll_();
    }).then(() => {
      return this.init();
    });
  }

  /**
   * @param {!IDBDatabase} db
   * @private
   */
  createCells_(db) {
    const v1SegmentStore =
        shaka.offline.indexeddb.StorageMechanism.V1_SEGMENT_STORE;
    const v2SegmentStore =
        shaka.offline.indexeddb.StorageMechanism.V2_SEGMENT_STORE;
    const v3SegmentStore =
        shaka.offline.indexeddb.StorageMechanism.V3_SEGMENT_STORE;

    const v1ManifestStore =
        shaka.offline.indexeddb.StorageMechanism.V1_MANIFEST_STORE;
    const v2ManifestStore =
        shaka.offline.indexeddb.StorageMechanism.V2_MANIFEST_STORE;
    const v3ManifestStore =
        shaka.offline.indexeddb.StorageMechanism.V3_MANIFEST_STORE;

    let stores = db.objectStoreNames;

    if (stores.contains(v1ManifestStore) && stores.contains(v1SegmentStore)) {
      shaka.log.debug('Mounting v1 idb storage cell');
      shaka.log.warning('V1 storage cell found... support coming soon.');
    }

    if (stores.contains(v2ManifestStore) && stores.contains(v2SegmentStore)) {
      shaka.log.debug('Mounting v2 idb storage cell');

      this.v2_ = new shaka.offline.indexeddb.V2StorageCell(
          db,
          v2SegmentStore,
          v2ManifestStore,
          true);  // Are keys locked? Yes, this means no new additions.
    }

    if (stores.contains(v3ManifestStore) && stores.contains(v3SegmentStore)) {
      shaka.log.debug('Mounting v3 idb storage cell');

      // Version 3 uses the same structure as version 2, so we can use the same
      // cells but it can support new entries.
      this.v3_ = new shaka.offline.indexeddb.V2StorageCell(
          db,
          v3SegmentStore,
          v3ManifestStore,
          false); // Are keys locked? No, this means we can add new entries.
    }
  }

  /**
   * @param {!IDBDatabase} db
   * @private
   */
  createStores_(db) {
    const segmentStore =
        shaka.offline.indexeddb.StorageMechanism.V3_SEGMENT_STORE;
    const manifestStore =
        shaka.offline.indexeddb.StorageMechanism.V3_MANIFEST_STORE;

    const storeSettings = {autoIncrement: true};

    db.createObjectStore(manifestStore, storeSettings);
    db.createObjectStore(segmentStore, storeSettings);
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
shaka.offline.indexeddb.StorageMechanism.VERSION = 3;
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



shaka.offline.StorageMuxer.register(
    'idb',
    () => new shaka.offline.indexeddb.StorageMechanism());
