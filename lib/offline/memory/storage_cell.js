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

goog.provide('shaka.offline.memory.StorageCell');

goog.require('shaka.offline.memory.StorageTable');
goog.require('shaka.util.MapUtils');



/**
 * @implements {shakaExtern.StorageCell}
 */
shaka.offline.memory.StorageCell = class {
  constructor() {
    /**
     * @private {!shaka.offline.memory.StorageTable<shakaExtern.SegmentDataDB>}
     */
    this.segments_ = new shaka.offline.memory.StorageTable();

    /**
     * @private {!shaka.offline.memory.StorageTable<shakaExtern.ManifestDB>}
     */
    this.manifests_ = new shaka.offline.memory.StorageTable();
  }


  /**
   * @override
   */
  destroy() {
    // Unlike other storage cells, there is no way to keep the data around
    // after we destroy the cell.
    this.segments_.clear();
    this.manifests_.clear();

    return Promise.resolve();
  }


  /**
   * @override
   */
  hasFixedKeySpace() {
    // This cell will allow new segments and manifests to be added.
    return false;
  }


  /**
   * @override
   */
  addSegments(segments) {
    let keys = this.segments_.getKeys(segments.length);

    for (let i = 0; i < keys.length; i++) {
      this.segments_.set(keys[i], segments[i]);
    }

    return Promise.resolve(keys);
  }


  /**
   * @override
   */
  removeSegments(keys) {
    this.segments_.remove(keys);
    return Promise.resolve();
  }


  /**
   * @override
   */
  getSegments(keys) {
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<number, shakaExtern.SegmentDataDB>}*/
    let map = this.segments_.get(keys);

    // Make sure that every key was found.
    if (!keys.every((key) => key in map)) {
      return Promise.reject();
    }

    return Promise.resolve(MapUtils.values(map));
  }


  /**
   * @override
   */
  addManifests(manifests) {
    let keys = this.manifests_.getKeys(manifests.length);

    for (let i = 0; i < keys.length; i++) {
      this.manifests_.set(keys[i], manifests[i]);
    }

    return Promise.resolve(keys);
  }


  /**
   * @override
   */
  updateManifests(manifests) {
    shaka.util.MapUtils.forEach(manifests, (key, value) => {
      this.manifests_.set(key, value);
    });

    return Promise.resolve();
  }


  /**
   * @override
   */
  removeManifests(keys) {
    this.manifests_.remove(keys);
    return Promise.resolve();
  }


  /**
   * @override
   */
  getManifests(keys) {
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<number, shakaExtern.ManifestDB>}*/
    let map = this.manifests_.get(keys);

    // Make sure that every key was found.
    if (!keys.every((key) => key in map)) {
      return Promise.reject();
    }

    return Promise.resolve(MapUtils.values(map));
  }


  /**
   * @override
   */
  getAllManifests() {
    /** @type {!Object.<number, shakaExtern.ManifestDB>}*/
    let map = this.manifests_.all();
    return Promise.resolve(map);
  }
};
