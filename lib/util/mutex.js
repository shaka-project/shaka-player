/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Mutex');

goog.require('shaka.log');


/**
 * @summary A simple mutex.
 */
shaka.util.Mutex = class {
  /** Constructs the mutex. */
  constructor() {
    /** @private {?string} */
    this.acquiredIdentifier_ = null;

    /** @private {!Array<function()>} */
    this.unlockQueue_ = [];
  }

  /**
   * Acquires the mutex, as soon as possible.
   * @param {string} identifier
   * @return {!Promise}
   */
  async acquire(identifier) {
    shaka.log.v2(identifier + ' has requested mutex');
    if (this.acquiredIdentifier_) {
      await new Promise((resolve) => this.unlockQueue_.push(resolve));
    }
    this.acquiredIdentifier_ = identifier;
    shaka.log.v2(identifier + ' has acquired mutex');
  }

  /**
   * Releases your hold on the mutex.
   */
  release() {
    shaka.log.v2(this.acquiredIdentifier_ + ' has released mutex');
    if (this.unlockQueue_.length > 0) {
      this.unlockQueue_.shift()();
    } else {
      this.acquiredIdentifier_ = null;
    }
  }

  /**
   * Completely releases the mutex. Meant for use by the tests.
   */
  releaseAll() {
    while (this.acquiredIdentifier_) {
      this.release();
    }
  }
};
