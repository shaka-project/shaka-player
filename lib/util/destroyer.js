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

goog.require('shaka.util.IDestroyable');



/**
 * A utility class to help work with |shaka.util.IDestroyable| objects.
 *
 * @final
 */
shaka.util.Destroyer = class {
  /**
   * A helper function to call |destroy| on |shaka.util.IDestroyable| objects
   * in |objs| after |callback| terminates. All objects in |objs| will have
   * |destroy| called regardless if |callback| is resolved or is rejected.
   *
   * @param {!Array.<!shaka.util.IDestroyable>} objs
   *    A list of destroyable objects that should be destroyed after the
   *    callback completes.
   * @param {function():!Promise<T>|function():T} callback
   *    A callback that should perform actions on the objects in |objs|. When
   *    the promise returned by this callback is resolved or is rejected, all
   *    objects in |objs| will have |destroy| called.
   * @return {!Promise.<T>}
   * @template T
   */
  static async with(objs, callback) {
    try {
      return await Promise.resolve(callback());
    } finally {
      await Promise.all(objs.map((obj) => obj.destroy()));
    }
  }
};
