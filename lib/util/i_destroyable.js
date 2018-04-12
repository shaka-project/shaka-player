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

goog.provide('shaka.util.IDestroyable');



/**
 * An interface to standardize how objects are destroyed.
 * @interface
 * @exportInterface
 */
shaka.util.IDestroyable = function() {};


/**
 * Destroys the object, releasing all resources and shutting down all
 * operations.  Returns a Promise which is resolved when destruction is
 * complete.  This Promise should never be rejected.
 *
 * @return {!Promise}
 * @exportInterface
 */
shaka.util.IDestroyable.prototype.destroy = function() {};


/**
 * A helper function that will destroy a group of destroyable object once the
 * callback (and its promises) complete. The destroyable object will be
 * destroyed regardless of whether or not the callback (and its promises) get
 * resolved or rejected.
 *
 * @param {!Array.<!shaka.util.IDestroyable>} objs A list of destroyable object
 *                                                 that should be destroyed
 *                                                 after the callback completes.
 * @param {function():!Promise<T>|function():T} callback
 * @return {!Promise.<T>}
 * @template T
 */
shaka.util.IDestroyable.with = function(objs, callback) {
  let cleanup = () => {
    return Promise.all(objs.map((obj) => obj.destroy()));
  };

  return Promise.resolve(callback()).then(
    (r) => cleanup().then(() => r),
    (e) => cleanup().then(() => { throw e; }));
};
