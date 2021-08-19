/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.offline.indexeddb.V5StorageCell');

goog.require('shaka.offline.indexeddb.BaseStorageCell');


/**
 * The V5StorageCell is for all stores that follow the shaka.externs V5 offline
 * types introduced in v3.0.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.indexeddb.V5StorageCell = class
  extends shaka.offline.indexeddb.BaseStorageCell {
  /** @override */
  hasFixedKeySpace() {
    // This makes the cell read-write.
    return false;
  }

  /** @override */
  addSegments(segments) {
    return this.add(this.segmentStore_, segments);
  }

  /** @override */
  addManifests(manifests) {
    return this.add(this.manifestStore_, manifests);
  }

  /** @override */
  updateManifest(key, manifest) {
    return this.updateManifestImplementation(key, manifest);
  }

  /** @override */
  convertManifest(old) {
    // JSON serialization turns Infinity into null, so turn it back now.
    if (old.expiration == null) {
      old.expiration = Infinity;
    }
    return Promise.resolve(/** @type {shaka.extern.ManifestDB} */(old));
  }
};
