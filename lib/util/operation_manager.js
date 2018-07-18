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
  constructor() {
    /** @private {!Array.<!shaka.extern.IAbortableOperation>} */
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
    let cleanup = [];
    this.operations_.forEach((op) => {
      // Catch and ignore any failures.  This silences error logs in the
      // JavaScript console about uncaught Promise failures.
      op.promise.catch(() => {});

      // Now abort the operation.
      cleanup.push(op.abort());
    });

    this.operations_ = [];
    return Promise.all(cleanup);
  }
};
