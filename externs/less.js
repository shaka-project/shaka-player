/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for less.js library.
 * @externs
 */


/** @const */
const less = class {
  static registerStylesheetsImmediately() {}

  /**
   * @param {boolean} reload
   * @param {boolean} modifyVars
   * @param {boolean} clearFileCache
   * @return {!Promise}
   */
  static refresh(reload, modifyVars, clearFileCache) {}
};
