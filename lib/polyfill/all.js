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

goog.provide('shaka.polyfill');

goog.require('shaka.util.Iterables');


/**
 * @summary A one-stop installer for all polyfills.
 * @see http://enwp.org/polyfill
 * @exportDoc
 */
shaka.polyfill = class {
  /**
   * Install all polyfills.
   * @export
   */
  static installAll() {
    for (const polyfill of shaka.polyfill.polyfills_) {
      polyfill.callback();
    }
  }

  /**
   * Registers a new polyfill to be installed.
   *
   * @param {function()} polyfill
   * @param {number=} priority An optional number priority.  Higher priorities
   *   will be executed before lower priority ones.  Default is 0.
   * @export
   */
  static register(polyfill, priority) {
    const newItem = {priority: priority || 0, callback: polyfill};
    const enumerate = (it) => shaka.util.Iterables.enumerate(it);
    for (const {i, item} of enumerate(shaka.polyfill.polyfills_)) {
      if (item.priority < newItem.priority) {
        shaka.polyfill.polyfills_.splice(i, 0, newItem);
        return;
      }
    }
    shaka.polyfill.polyfills_.push(newItem);
  }
};


/**
 * Contains the polyfills that will be installed.
 * @private {!Array.<{priority: number, callback: function()}>}
 */
shaka.polyfill.polyfills_ = [];
