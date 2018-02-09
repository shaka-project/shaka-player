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

goog.provide('shaka.offline.StorageMuxer');

goog.require('shaka.util.MapUtils');



/**
 * Storage Muxer is responsible for managing StorageMechanisms and addressing
 * cells. The primary purpose of the muxer is to give the caller the correct
 * cell for the operations they want to perform.
 *
 * |findActive| will be used when the caller wants a cell that supports
 * add-operations. This will be used when saving new content to storage.
 *
 * |findAll| will be used when the caller want to look at all the content
 * in storage.
 *
 * |resolvePath| will be used to converts a path (from |findActive| and
 * |findAll|) and returns the cell.
 */
shaka.offline.StorageMuxer = class {
  constructor() {
    /**
     * A key in this map is the name given when registering a StorageMechanism.
     *
     * @private {!Object.<string, !shakaExtern.StorageMechanism>}
     */
    this.mechanisms_ = {};

    /**
     * Keep a mapping from path to cell so that we don't need to search
     * for cells each time we need a cell.
     *
     * @private {!Object.<string, !shakaExtern.StorageCell>}
     */
    this.cells_ = {};
  }

  /**
   * Free all resources used by the muxer, mechanisms, and cells. This should
   * not affect the stored content.
   *
   * @return {!Promise}
   */
  destroy() {
    /** @type {!Array.<!shakaExtern.StorageMechanism>} */
    let destroys = shaka.util.MapUtils
        .values(this.mechanisms_)
        .map((mechanism) => mechanism.destroy());

    // Empty each map so that subsequent calls will be no-ops.
    this.mechanisms_ = {};
    this.cells_ = {};

    return Promise.all(destroys);
  }

  /**
   * Initialize the storage muxer. This must be called before any other calls.
   * This will initialize the muxer to use all mechanisms that have been
   * registered with |StorageMuxer.register|.
   *
   * @return {!Promise}
   */
  init() {
    const MapUtils = shaka.util.MapUtils;
    const StorageMuxer = shaka.offline.StorageMuxer;

    // Add the new instance of each mechanism to the muxer.
    MapUtils.forEach(StorageMuxer.registry_, (name, factory) => {
      this.mechanisms_[name] = factory();
    });

    let initPromises = MapUtils
        .values(this.mechanisms_)
        .map((mechanism) => mechanism.init());

    return Promise.all(initPromises).then(() => this.remapCells_());
  }

  /**
   * Go through all the storage mechanisms and map their cells to the full
   * paths.
   *
   * @private
   */
  remapCells_() {
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Object.<string, !shakaExtern.StorageCell>} */
    let cellMap = {};

    MapUtils.forEach(this.mechanisms_, (mechanismName, mechanism) => {
      MapUtils.forEach(mechanism.getCells(), (cellName, cell) => {
        // Create a special key for the cell. The key is defined as
        // the cell name "at" the mechanism name.
        cellMap[cellName + '@' + mechanismName] = cell;
      });
    });

    this.cells_ = cellMap;
  }

  /**
   * Get paths to all cells that support add-operations. All paths can be used
   * with |resolvePath|.
   *
   * @return {!Array.<string>}
   */
  findActive() {
    const MapUtils = shaka.util.MapUtils;

    /** @type {!Array.<string>} */
    let active = [];

    MapUtils.forEach(this.cells_, (path, cell) => {
      if (!cell.hasFixedKeySpace()) {
        active.push(path);
      }
    });

    return active;
  }

  /**
   * Get paths to all cells. All paths can be used with |resolvePath|.
   *
   * @return {!Array.<string>}
   */
  findAll() {
    return Object.keys(this.cells_);
  }

  /**
   * Find the cell that the path points to. A path is made up of a mount point
   * and a cell id. If a cell can be found, the cell will be returned. If no
   * cell is found, null will be returned.
   *
   * @param {string} path
   * @return {shakaExtern.StorageCell}
   */
  resolvePath(path) {
    return this.cells_[path];
  }

  /**
   * This will erase all previous content from storage. Using paths obtained
   * before calling |erase| is discouraged, as cells may have changed during a
   * erase.
   *
   * @return {!Promise}
   */
  erase() {
    const MapUtils = shaka.util.MapUtils;

    let erases = MapUtils.values(this.mechanisms_).map((mechanism) => {
      return mechanism.erase();
    });

    // Since the cells in a mechanism can change after erasing we need to
    // remap the cell map. We do not need to re-init as mechanisms are suppose
    // to self-initialize after an erase.
    return Promise.all(erases).then(() => this.remapCells_());
  }

  /**
   * Register a storage mechanism for use with the default storage muxer. This
   * will have no effect on any storage muxer already in main memory.
   *
   * @param {string} name
   * @param {function():!shakaExtern.StorageMechanism} factory
   * @export
   */
  static register(name, factory) {
    const StorageMuxer = shaka.offline.StorageMuxer;
    StorageMuxer.registry_[name] = factory;
  }


  /**
   * Unregister a storage mechanism for use with the default storage muxer. This
   * will have no effect on any storage muxer already in main memory.
   *
   * @param {string} name The name that the storage mechanism was registered
   *                      under.
   * @export
   */
  static unregister(name) {
    const StorageMuxer = shaka.offline.StorageMuxer;
    delete StorageMuxer.registry_[name];
  }
};


/**
 * @private {!Object.<string, function():!shakaExtern.StorageMechanism>}
 */
shaka.offline.StorageMuxer.registry_ = {};
