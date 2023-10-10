/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mutex');

// TODO: revisit this when Closure Compiler supports partially-exported classes.
/**
 * @summary A simple mutex.
 * @export
 */
shaka.util.Mutex = class {
  /** Constructs the mutex. */
  constructor() {
    /** @private {boolean} */
    this.acquired = false;

    /** @private {!Array.<function()>} */
    this.unlockQueue = [];
  }

  /**
   * Acquires the mutex, as soon as possible.
   * @return {!Promise}
   * @export
   */
  async acquire() {
    if (this.acquired) {
      await new Promise((resolve) => this.unlockQueue.push(resolve));
    }
    this.acquired = true;
  }

  /**
   * Releases your hold on the mutex.
   * @export
   */
  release() {
    if (this.unlockQueue.length > 0) {
      this.unlockQueue.shift()();
    } else {
      this.acquired = false;
    }
  }
};
