/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.msf.PackagingRegistry');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary An interface to register MSF packagings.
 *
 * Packagings register themselves, so this registry has no knowledge of which
 * ones exist. Supporting a new packaging means adding an implementation that
 * registers itself and requiring it from shaka-player.uncompiled.js, with no
 * change here. Applications can register a packaging of their own the same
 * way, or unregister one they do not want offered.
 *
 * @export
 */
shaka.msf.PackagingRegistry = class {
  /**
   * Registers an MSF packaging.
   *
   * @param {string} name The catalog `packaging` value this handles, e.g.
   *   'm2ts'.
   * @param {shaka.extern.MsfPackaging.Factory} packagingFactory The factory
   *   used to create packaging instances.
   * @export
   */
  static registerPackaging(name, packagingFactory) {
    shaka.msf.PackagingRegistry.packagingsByName.set(name, packagingFactory);
  }

  /**
   * Unregisters an MSF packaging.
   *
   * @param {string} name
   * @export
   */
  static unregisterPackaging(name) {
    shaka.msf.PackagingRegistry.packagingsByName.delete(name);
  }

  /**
   * Returns the names of all registered packagings.
   *
   * @return {!Array<string>}
   * @export
   */
  static getRegisteredPackagings() {
    return Array.from(shaka.msf.PackagingRegistry.packagingsByName.keys());
  }

  /**
   * Creates a packaging instance for a catalog track's `packaging` value, or
   * returns null when nothing is registered for it. An instance is created per
   * track, because a packaging carries the state it derived from that track.
   *
   * @param {string|undefined} name
   * @return {?shaka.extern.MsfPackaging}
   */
  static create(name) {
    if (!name) {
      return null;
    }
    const factory = shaka.msf.PackagingRegistry.packagingsByName.get(name);
    return factory ? factory() : null;
  }
};


/**
 * Contains the registered packaging factories, keyed by catalog name.
 *
 * @type {!Map<string, shaka.extern.MsfPackaging.Factory>}
 */
shaka.msf.PackagingRegistry.packagingsByName = new Map();
