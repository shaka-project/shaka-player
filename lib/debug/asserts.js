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

goog.provide('goog.asserts');


/**
 * @namespace goog.asserts
 * @summary An assertion framework which is compiled out for deployment.
 *   NOTE: this is not the closure library version.  This uses the same name so
 *   the closure compiler will be able to use the conditions to assist type
 *   checking.
 */


/**
 * @define {boolean} true to enable asserts, false otherwise.
 */
goog.define('goog.asserts.ENABLE_ASSERTS', goog.DEBUG);


/** @type {function(*, string)} */
goog.asserts.assert = function() {};


/** @private */
goog.asserts.patchAssert_ = function() {
  let assert = console.assert;

  if (!assert) {
    console.assert = function() {};
  } else if (!assert.bind) {
    // IE 9 does not provide a .bind for the built-in console functions.
    console.assert = function() {
      assert.apply(console, arguments);
    };
  }
};


// Install assert functions.
if (goog.asserts.ENABLE_ASSERTS) {
  goog.asserts.patchAssert_();

  goog.asserts.assert = console.assert.bind(console);
}
