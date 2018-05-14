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

goog.provide('shaka.polyfill.installAll');
goog.provide('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill
 * @summary A one-stop installer for all polyfills.
 * @see http://enwp.org/polyfill
 * @exportDoc
 */


/**
 * Install all polyfills.
 * @export
 */
shaka.polyfill.installAll = function() {
  for (let i = 0; i < shaka.polyfill.polyfills_.length; ++i) {
    shaka.polyfill.polyfills_[i].callback();
  }
};


/**
 * Contains the polyfills that will be installed.
 * @private {!Array.<{priority: number, callback: function()}>}
 */
shaka.polyfill.polyfills_ = [];


/**
 * Registers a new polyfill to be installed.
 *
 * @param {function()} polyfill
 * @param {number=} priority An optional number priority.  Higher priorities
 *   will be executed before lower priority ones.  Default is 0.
 * @export
 */
shaka.polyfill.register = function(polyfill, priority) {
  priority = priority || 0;
  const item = {priority: priority, callback: polyfill};
  for (let i = 0; i < shaka.polyfill.polyfills_.length; i++) {
    if (shaka.polyfill.polyfills_[i].priority < priority) {
      shaka.polyfill.polyfills_.splice(i, 0, item);
      return;
    }
  }
  shaka.polyfill.polyfills_.push(item);
};
