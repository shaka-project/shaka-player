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

goog.provide('shaka.util.Destroyer');

goog.require('shaka.util.PublicPromise');


/**
 * @summary
 * A utility class to help work with |shaka.util.IDestroyable| objects.
 *
 * @final
 */
shaka.util.Destroyer = class {
  /**
   * @param {function():!Promise} callback
   *    A callback to destroy an object. This callback will only be called once
   *    regardless of how many times |destroy| is called.
   */
  constructor(callback) {
    /** @private {boolean} */
    this.destroyed_ = false;

    /** @private {!shaka.util.PublicPromise} */
    this.waitOnDestroy_ = new shaka.util.PublicPromise();

    /** @private {function():!Promise} */
    this.onDestroy_ = callback;
  }

  /**
   * Check if |destroy| has been called. This returning |true| does not mean
   * that the promise returned by |destroy| has resolved yet.
   *
   * @return {boolean}
   * @final
   */
  destroyed() {
    return this.destroyed_;
  }

  /**
   * Request that the destroy callback be called. Will return a promise that
   * will resolve once the callback terminates. The promise will never be
   * rejected.
   *
   * @return {!Promise}
   * @final
   */
  destroy() {
    if (this.destroyed_) {
      return this.waitOnDestroy_;
    }

    // We have started destroying this object, so we should never get here
    // again.
    this.destroyed_ = true;

    return this.onDestroy_().then(
        () => { this.waitOnDestroy_.resolve(); },
        () => { this.waitOnDestroy_.resolve(); });
  }

  /**
   * Checks if the object is destroyed and throws an error if it is.
   * @param {*=} error The inner error, if any.
   */
  ensureNotDestroyed(error) {
    if (this.destroyed_) {
      if (error && error.code == shaka.util.Error.Code.OBJECT_DESTROYED) {
        throw error;
      } else {
        throw shaka.util.Destroyer.destroyedError(error);
      }
    }
  }

  /**
   * @param {*=} error The inner error, if any.
   * @return {!shaka.util.Error}
   */
  static destroyedError(error) {
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.PLAYER,
        shaka.util.Error.Code.OBJECT_DESTROYED,
        error);
  }
};
