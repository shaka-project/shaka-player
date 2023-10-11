/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mutex');


/**
 * @summary A simple mutex.
 */
shaka.util.Mutex = class {
  /** Constructs the mutex. */
  constructor() {
    /** @private {?string} */
    this.acquiredIdentifier = null;

    /** @private {!Array.<function()>} */
    this.unlockQueue = [];
  }

  /**
   * Acquires the mutex, as soon as possible.
   * @param {string} identifier
   * @return {!Promise}
   */
  async acquire(identifier) {
    if (this.acquiredIdentifier) {
      await new Promise((resolve) => this.unlockQueue.push(resolve));
    }
    this.acquiredIdentifier = identifier;
  }

  /**
   * Releases your hold on the mutex.
   */
  release() {
    if (this.unlockQueue.length > 0) {
      this.unlockQueue.shift()();
    } else {
      this.acquiredIdentifier = null;
    }
  }
};
