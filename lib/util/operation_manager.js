/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.OperationManager');

goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.IDestroyable');

/**
 * A utility for cleaning up AbortableOperations, to help simplify common
 * patterns and reduce code duplication.
 *
 * @implements {shaka.util.IDestroyable}
 */
shaka.util.OperationManager = class {
  /** */
  constructor() {
    /** @private {!Array<!shaka.extern.IAbortableOperation>} */
    this.operations_ = [];
  }

  /**
   * Manage an operation.  This means aborting it on destroy() and removing it
   * from the management set when it complete.
   *
   * @param {!shaka.extern.IAbortableOperation} operation
   */
  manage(operation) {
    this.operations_.push(operation.finally(() => {
      shaka.util.ArrayUtils.remove(this.operations_, operation);
    }));
  }

  /** @override */
  destroy() {
    const cleanup = [];
    for (const op of this.operations_) {
      // Catch and ignore any failures.  This silences error logs in the
      // JavaScript console about uncaught Promise failures.
      op.promise.catch(() => {});

      // Now abort the operation.
      cleanup.push(op.abort());
    }

    this.operations_ = [];
    return Promise.all(cleanup);
  }
};
