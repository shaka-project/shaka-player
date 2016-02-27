/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.asserts');


/**
 * @namespace shaka.asserts
 * @summary An assertion framework which is compiled out for deployment.
 */


/**
 * @define {boolean} true to enable asserts, false otherwise.
 */
goog.define('shaka.asserts.ENABLE_ASSERTS', goog.DEBUG);


/** @type {function(*, string=)} */
shaka.asserts.assert = function() {};


/** @type {function()} */
shaka.asserts.notImplemented = function() {};


/** @type {function()} */
shaka.asserts.unreachable = function() {};


/** @private */
shaka.asserts.patchAssert_ = function() {
  var assert = console.assert;

  if (!assert) {
    console.assert = function() {};
  }
};


// Install assert functions.
if (shaka.asserts.ENABLE_ASSERTS) {
  shaka.asserts.patchAssert_();

  shaka.asserts.assert = function(test, opt_message) {
    var message = opt_message;
    if (!test && !message) {
      // IE11 does not display any stack information on assertions.  So if
      // there is no message, create one from the stack.
      try {
        throw new Error();
      } catch (error) {
        // Line 0 is "Error", line 1 is this location, line 2 is the immediate
        // caller of shaka.asserts.assert().
        message = error.stack.split('\n')[2];
      }
    }
    console.assert(test, message);
  };

  shaka.asserts.notImplemented =
      console.assert.bind(console, 0 == 1, 'Not implemented.');

  shaka.asserts.unreachable =
      console.assert.bind(console, 0 == 1, 'Unreachable reached.');
}
