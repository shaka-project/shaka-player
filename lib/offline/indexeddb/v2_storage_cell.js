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
    return this.add_(this.segmentStore_, segments);
  }

  /** @override */
  addManifests(manifests) {
    return this.add_(this.manifestStore_, manifests);
  }
};
