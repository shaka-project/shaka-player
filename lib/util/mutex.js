/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.module('shaka.util.Mutex');
goog.module.declareLegacyNamespace();


/**
 * @summary A simple mutex.
 */
exports = class Mutex {
  /** Creates the mutex. */
  constructor() {
    /** @private {!Array.<function()>} */
    this.waiting_ = [];

    /** @private {number} */
    this.nextMutexId_ = 0;

    /** @private {number} */
    this.acquiredMutexId_ = 0;
  }

  /** @return {!Promise.<number>} mutexId */
  async acquire() {
    const mutexId = ++this.nextMutexId_;
    if (!this.acquiredMutexId_) {
      this.acquiredMutexId_ = mutexId;
    } else {
      await (new Promise((resolve, reject) => {
        this.waiting_.push(() => {
          this.acquiredMutexId_ = mutexId;
          resolve();
        });
      }));
    }
    return mutexId;
  }

  /** @param {number} mutexId */
  release(mutexId) {
    if (mutexId == this.acquiredMutexId_) {
      this.acquiredMutexId_ = 0;
      if (this.waiting_.length > 0) {
        const callback = this.waiting_.shift();
        callback();
      }
    }
  }
};
