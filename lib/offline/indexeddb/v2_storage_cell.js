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
 * The V2StorageCell is for all stores that follow the shaka.externs V2 and V3
 * offline types.  V2 was introduced in Shaka Player v2.3.0 and quickly
 * replaced with V3 in Shaka Player v2.3.2.
 *
 * Upgrading from V1 to V2 initially broke the database in a way that prevented
 * adding new records.  The problem was with the upgrade process, not with the
 * database format.  Once database upgrades were removed, we increased the
 * database version to V3 and marked V2 as read-only.  Therefore, V2 and V3
 * databases can both be read by this cell.
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
    if (this.isFixedKey_) {
      return this.rejectAdd(this.segmentStore_);
    }
    return this.add(this.segmentStore_, segments);
  }

  /** @override */
  addManifests(manifests) {
    if (this.isFixedKey_) {
      return this.rejectAdd(this.manifestStore_);
    }
    return this.add(this.manifestStore_, manifests);
  }

  /**
   * @override
   * @param {shaka.extern.ManifestDB} old
   * @return {shaka.extern.ManifestDB}
   */
  convertManifest(old) {
    // JSON serialization turns Infinity into null, so turn it back now.
    if (old.expiration == null) {
      old.expiration = Infinity;
    }
    return old;
  }
};
