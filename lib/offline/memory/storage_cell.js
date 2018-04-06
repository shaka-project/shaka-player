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
goog.require('shaka.util.Error');
goog.require('shaka.util.MapUtils');



/**
 * A storage cell that holds all values in main memory. This should be used
 * for testing when true persistence is not needed.
 *
 * When a value passes through StorageCell, a shallow copy will be made to
 * avoid changes outside of StorageCell from affecting the internal copy.
 *
 * @implements {shaka.extern.StorageCell}
 */
shaka.offline.memory.StorageCell = class {
  constructor() {
    /**
     * @private {!shaka.offline.memory.StorageTable<shaka.extern.SegmentDataDB>}
     */
    this.segments_ = new shaka.offline.memory.StorageTable();

    /**
     * @private {!shaka.offline.memory.StorageTable<shaka.extern.ManifestDB>}
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
    const CLASS = shaka.offline.memory.StorageCell;

    let keys = this.segments_.getKeys(segments.length);

    for (let i = 0; i < keys.length; i++) {
      this.segments_.set(keys[i], CLASS.clone_(segments[i]));
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
    const CLASS = shaka.offline.memory.StorageCell;
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<number, shaka.extern.SegmentDataDB>}*/
    let map = this.segments_.get(keys);

    // Make sure that every key was found.
    let missing = keys.filter((key) => !(key in map));
    if (missing.length) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.KEY_NOT_FOUND,
          'Could not find values for ' + missing
      ));
    }

    let values = MapUtils.values(map).map((value) => CLASS.clone_(value));
    return Promise.resolve(values);
  }

  /**
   * @override
   */
  addManifests(manifests) {
    const CLASS = shaka.offline.memory.StorageCell;

    let keys = this.manifests_.getKeys(manifests.length);

    for (let i = 0; i < keys.length; i++) {
      this.manifests_.set(keys[i], CLASS.clone_(manifests[i]));
    }

    return Promise.resolve(keys);
  }

  /**
   * @override
   */
  updateManifestExpiration(key, newExpiration) {
    let found = this.manifests_.get([key])[key];

    // If we can't find the value, then there is nothing for us to update.
    if (!found) { return Promise.resolve(); }

    found.expiration = newExpiration;

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
    const CLASS = shaka.offline.memory.StorageCell;
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<number, shaka.extern.ManifestDB>}*/
    let map = this.manifests_.get(keys);

    // Make sure that every key was found.
    let missing = keys.filter((key) => !(key in map));
    if (missing.length) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.RECOVERABLE,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.KEY_NOT_FOUND,
          'Could not find values for ' + missing
      ));
    }

    let values = MapUtils.values(map).map((value) => CLASS.clone_(value));
    return Promise.resolve(values);
  }

  /**
   * @override
   */
  getAllManifests() {
    const CLASS = shaka.offline.memory.StorageCell;
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<number, shaka.extern.ManifestDB>}*/
    let clone = {};

    MapUtils.forEach(this.manifests_.map(), (key, value) => {
      clone[Number(key)] = CLASS.clone_(value);
    });

    return Promise.resolve(clone);
  }

  /**
   * @param {T} target
   * @return {T}
   * @private
   * @template T
   */
  static clone_(target) {
    if (target == null) {
      return null;
    }

    let copy = {};

    Object.keys(target).forEach((key) => {
      copy[key] = target[key];
    });

    return copy;
  }
};
