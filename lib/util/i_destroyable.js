/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.IDestroyable');


/**
 * An interface to standardize how objects are destroyed.
 *
 * @interface
 * @exportInterface
 */
shaka.util.IDestroyable = class {
  /**
   * Request that this object be destroyed, releasing all resources and shutting
   * down all operations. Returns a Promise which is resolved when destruction
   * is complete. This Promise should never be rejected.
   *
   * @return {!Promise}
   * @exportInterface
   */
  destroy() {}
};
