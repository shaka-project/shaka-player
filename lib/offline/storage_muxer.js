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

goog.provide('shaka.offline.StorageCellHandle');
goog.provide('shaka.offline.StorageCellPath');
goog.provide('shaka.offline.StorageMuxer');

goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');

/**
 * @typedef {{
 *  mechanism: string,
 *  cell: string
 * }}
 *
 * @property {string} mechanism
 *  The name of the mechanism that holds the cell.
 * @property {string} cell
 *  The name of the cell in the mechanism.
 */
shaka.offline.StorageCellPath;


/**
 * @typedef {{
 *   path: shaka.offline.StorageCellPath,
 *   cell: !shaka.extern.StorageCell
 * }}
 *
 * @property {shaka.offline.StorageCellPath} path
 *   The path that maps to the cell.
 * @property {shaka.extern.StorageCell} cell
 *   The storage cell that the path points to within the storage muxer.
 */
shaka.offline.StorageCellHandle;


/**
 * StorageMuxer is responsible for managing StorageMechanisms and addressing
 * cells. The primary purpose of the muxer is to give the caller the correct
 * cell for the operations they want to perform.
 *
 * |findActive| will be used when the caller wants a cell that supports
 * add-operations. This will be used when saving new content to storage.
 *
 * |findAll| will be used when the caller want to look at all the content
 * in storage.
 *
 * |resolvePath| will be used to convert a path (from |findActive| and
 * |findAll|) into a cell, which it then returns.
 *
 * @implements {shaka.util.IDestroyable}
 */
shaka.offline.StorageMuxer = class {
  constructor() {
    /**
     * A key in this map is the name given when registering a StorageMechanism.
     *
     * @private {!Map.<string, !shaka.extern.StorageMechanism>}
     */
    this.mechanisms_ = new Map();
  }

  /**
   * Free all resources used by the muxer, mechanisms, and cells. This should
   * not affect the stored content.
   *
   * @override
   */
  destroy() {
    /** @type {!Array.<!Promise>} */
    const destroys = [];
    for (const mechanism of this.mechanisms_.values()) {
      destroys.push(mechanism.destroy());
    }

    // Empty the map so that subsequent calls will be no-ops.
    this.mechanisms_.clear();

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
    // Add the new instance of each mechanism to the muxer.
    const registry = shaka.offline.StorageMuxer.getRegistry_();
    registry.forEach((factory, name) => {
      const mech = factory();
      if (mech) {
        this.mechanisms_.set(name, mech);
      } else {
        shaka.log.info(
            'Skipping ' + name + ' as it is not supported on this platform');
      }
    });

    /** @type {!Array.<!Promise>} */
    const initPromises = [];
    for (const mechanism of this.mechanisms_.values()) {
      initPromises.push(mechanism.init());
    }

    return Promise.all(initPromises);
  }

  /**
   * Get a promise that will resolve with a storage cell that supports
   * add-operations. If no cell can be found, the promise will be rejected.
   *
   * @return {shaka.offline.StorageCellHandle}
   */
  getActive() {
    /** @type {?shaka.offline.StorageCellHandle} */
    let handle = null;

    this.mechanisms_.forEach((mechanism, mechanismName) => {
      mechanism.getCells().forEach((cell, cellName) => {
        // If this cell is not useful to us or we already have a handle, then
        // we don't need to make a new handle.
        if (cell.hasFixedKeySpace() || handle) { return; }

        const path = {
          mechanism: mechanismName,
          cell: cellName,
        };

        handle = {
          path: path,
          cell: cell,
        };
      });
    });

    if (handle) {
      return /** @type {shaka.offline.StorageCellHandle} */(handle);
    }

    throw new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.MISSING_STORAGE_CELL,
        'Could not find a cell that supports add-operations');
  }

  /**
   * @param {function(!shaka.offline.StorageCellPath,
   *                  !shaka.extern.StorageCell)} callback
   */
  forEachCell(callback) {
    this.mechanisms_.forEach((mechanism, mechanismName) => {
      mechanism.getCells().forEach((cell, cellName) => {
        const path = {
          mechanism: mechanismName,
          cell: cellName,
        };

        callback(path, cell);
      });
    });
  }

  /**
   * Get a specific storage cell. The promise will resolve with the storage
   * cell if it is found. If the storage cell is not found, the promise will
   * be rejected.
   *
   * @param {string} mechanismName
   * @param {string} cellName
   * @return {!shaka.extern.StorageCell}
   */
  getCell(mechanismName, cellName) {
    const mechanism = this.mechanisms_.get(mechanismName);
    if (!mechanism) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.MISSING_STORAGE_CELL,
          'Could not find mechanism with name ' + mechanismName);
    }

    const cell = mechanism.getCells().get(cellName);
    if (!cell) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.MISSING_STORAGE_CELL,
          'Could not find cell with name ' + cellName);
    }

    return cell;
  }

  /**
   * @param {function(!shaka.extern.EmeSessionStorageCell)} callback
   */
  forEachEmeSessionCell(callback) {
    this.mechanisms_.forEach((mechanism) => {
      callback(mechanism.getEmeSessionCell());
    });
  }

  /**
   * Gets an arbitrary EME session cell that can be used for storing new session
   * info.
   *
   * @return {!shaka.extern.EmeSessionStorageCell}
   */
  getEmeSessionCell() {
    const mechanisms = Array.from(this.mechanisms_.keys());
    if (!mechanisms.length) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.STORAGE_NOT_SUPPORTED,
          'No supported storage mechanisms found');
    }

    return this.mechanisms_.get(mechanisms[0]).getEmeSessionCell();
  }

  /**
   * Find the cell that the path points to. A path is made up of a mount point
   * and a cell id. If a cell can be found, the cell will be returned. If no
   * cell is found, null will be returned.
   *
   * @param {shaka.offline.StorageCellPath} path
   * @return {shaka.extern.StorageCell}
   */
  resolvePath(path) {
    const mechanism = this.mechanisms_.get(path.mechanism);

    if (!mechanism) { return null; }

    return mechanism.getCells().get(path.cell);
  }

  /**
   * This will erase all previous content from storage. Using paths obtained
   * before calling |erase| is discouraged, as cells may have changed during a
   * erase.
   *
   * @return {!Promise}
   */
  async erase() {
    // If we have initialized, we will use the existing mechanism instances.
    /** @type {!Array.<!shaka.extern.StorageMechanism>} */
    const mechanisms = Array.from(this.mechanisms_.values());
    const alreadyInitialized = mechanisms.length > 0;

    // If we have not initialized, we should still be able to erase.  This is
    // critical to our ability to wipe the DB in case of a version mismatch.
    // If there are no instances, create temporary ones and destroy them later.
    if (!alreadyInitialized) {
      const registry = shaka.offline.StorageMuxer.getRegistry_();
      registry.forEach((factory, name) => {
        const mech = factory();
        if (mech) {
          mechanisms.push(mech);
        }
      });
    }

    // Erase all storage mechanisms.
    await Promise.all(mechanisms.map((m) => m.erase()));

    // If we were erasing temporary instances, destroy them, too.
    if (!alreadyInitialized) {
      await Promise.all(mechanisms.map((m) => m.destroy()));
    }
  }

  /**
   * Register a storage mechanism for use with the default storage muxer. This
   * will have no effect on any storage muxer already in main memory.
   *
   * @param {string} name
   * @param {function():shaka.extern.StorageMechanism} factory
   * @export
   */
  static register(name, factory) {
    shaka.offline.StorageMuxer.registry_.set(name, factory);
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
    shaka.offline.StorageMuxer.registry_.delete(name);
  }

  /**
   * Check if there is support for storage on this platform. It is assumed that
   * if there are any mechanisms registered, it means that storage is supported
   * on this platform. We do not check if the mechanisms have any cells.
   *
   * @return {boolean}
   */
  static support() {
    const registry = shaka.offline.StorageMuxer.getRegistry_();
    // Make sure that we will have SOME mechanisms created by creating a
    // mechanism and immediately destroying it.
    for (const create of registry.values()) {
      const instance = create();

      if (instance) {
        instance.destroy();
        return true;
      }
    }

    return false;
  }

  /**
   * Replace the mechanism map used by the muxer. This should only be used
   * in testing.
   *
   * @param {Map.<string, function():shaka.extern.StorageMechanism>} map
   */
  static overrideSupport(map) {
    shaka.offline.StorageMuxer.override_ = map;
  }

  /**
   * Undo a previous call to |overrideSupport|.
   */
  static clearOverride() {
    shaka.offline.StorageMuxer.override_ = null;
  }

  /**
   * Get the registry. If the support has been disabled, this will always
   * an empty registry. Reading should always be done via |getRegistry_|.
   *
   * @return {!Map.<string, function():shaka.extern.StorageMechanism>}
   * @private
   */
  static getRegistry_() {
    const override = shaka.offline.StorageMuxer.override_;
    const registry = shaka.offline.StorageMuxer.registry_;

    if (COMPILED) {
      return registry;
    } else {
      return override || registry;
    }
  }
};


/**
 * @private {Map.<string, function():shaka.extern.StorageMechanism>}
 */
shaka.offline.StorageMuxer.override_ = null;


/**
 * @private {!Map.<string, function():shaka.extern.StorageMechanism>}
 */
shaka.offline.StorageMuxer.registry_ = new Map();
