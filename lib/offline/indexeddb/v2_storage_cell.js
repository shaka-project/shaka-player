/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.V2StorageCell');

goog.require('shaka.offline.indexeddb.BaseStorageCell');


/**
 * The V2StorageCell is for all stores that follow the shaka.externs V2 offline
 * types. This storage cell will work for both IndexedDB version 2 and 3 as
 * both used the shaka.externs V2 offline types.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.indexeddb.V2StorageCell = class
  extends shaka.offline.indexeddb.BaseStorageCell {
  /**
   * @param {IDBDatabase} connection
   * @param {string} segmentStore
   * @param {string} manifestStore
   * @param {boolean} isFixedKey
   */
  constructor(connection, segmentStore, manifestStore, isFixedKey) {
    super(connection, segmentStore, manifestStore);

    /** @private {boolean} */
    this.isFixedKey_ = isFixedKey;
  }

  /** @override */
  hasFixedKeySpace() {
    return this.isFixedKey_;
  }

  /** @override */
  addSegments(segments) {
    return this.add(this.segmentStore_, segments);
  }

  /** @override */
  addManifests(manifests) {
    return this.add(this.manifestStore_, manifests);
  }
};
