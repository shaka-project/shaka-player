/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.dependencies');

/**
 * @export
 */
shaka.dependencies = class {
  /**
   * Registers a new dependency.
   *
   * @param {shaka.dependencies.Allowed} key which is used for retrieving a
   *   dependency
   * @param {?} dep a dependency
   * @export
   */
  static add(key, dep) {
    if (!shaka.dependencies.Allowed[key]) {
      throw new Error(`${key} is not supported`);
    }
    shaka.dependencies.dependencies_.set(key, () => dep);
  }

  /**
   * Check if we have a dependency for the key.
   *
   * @param {shaka.dependencies.Allowed} key key
   * @return {boolean}
   * @export
   */
  static has(key) {
    return shaka.dependencies.dependencies_.has(key);
  }

  /** @return {?muxjs} */
  static muxjs() {
    return /** @type {?muxjs} */ (shaka.dependencies.dependencies_.get(
        shaka.dependencies.Allowed.muxjs)());
  }

  /** @return {?ISOBoxer} */
  static isoBoxer() {
    return /** @type {?ISOBoxer} */ (shaka.dependencies.dependencies_.get(
        shaka.dependencies.Allowed.ISOBoxer)());
  }
};

/**
 * @export
 * @enum {string}
 */
shaka.dependencies.Allowed = {
  muxjs: 'muxjs',
  ISOBoxer: 'ISOBoxer',
};

/**
 * Contains accessor functions to shared dependencies that could be used by
 * other components.  The default accessors can be overridden.
 *
 * @private {!Map.<shaka.dependencies.Allowed, function():?>}
 */
shaka.dependencies.dependencies_ = new Map([
  [shaka.dependencies.Allowed.muxjs, () => window.muxjs],
  [shaka.dependencies.Allowed.ISOBoxer, () => window.ISOBoxer],
]);
