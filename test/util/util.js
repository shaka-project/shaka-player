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


/**
 * Capture a Promise's status and attach it to the Promise.
 * @param {!Promise} promise
 */
function capturePromiseStatus(promise) {
  promise.status = 'pending';
  promise.then(function() {
    promise.status = 'resolved';
  }, function() {
    promise.status = 'rejected';
  });
}


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @param {function(function(), number)=} opt_setTimeout
 * @return {!Promise}
 */
function delay(seconds, opt_setTimeout) {
  return new Promise(function(resolve, reject) {
    var timeout = opt_setTimeout || setTimeout;
    timeout(resolve, seconds * 1000.0);
  });
}


/**
 * Replace shaka.asserts and console.assert with a version which hooks into
 * jasmine.  This converts all failed assertions into failed tests.
 */
var assertsToFailures = {
  uninstall: function() {
    shaka.asserts = assertsToFailures.originalShakaAsserts_;
    console.assert = assertsToFailures.originalConsoleAssert_;
  },

  install: function() {
    assertsToFailures.originalShakaAsserts_ = shaka.asserts;
    assertsToFailures.originalConsoleAssert_ = console.assert;

    var realAssert = console.assert.bind(console);

    var jasmineAssert = function(condition, opt_message) {
      realAssert(condition, opt_message);
      if (!condition) {
        var message = opt_message || 'Assertion failed.';
        console.error(message);
        try {
          throw new Error(message);
        } catch (exception) {
          fail(message);
        }
      }
    };

    shaka.asserts = {
      assert: function(condition, opt_message) {
        jasmineAssert(condition, opt_message);
      },
      notImplemented: function() {
        jasmineAssert(false, 'Not implemented.');
      },
      unreachable: function() {
        jasmineAssert(false, 'Unreachable reached.');
      }
    };

    console.assert = jasmineAssert;
  }
};


// Make sure assertions are converted into failures for all tests.
beforeAll(assertsToFailures.install);
afterAll(assertsToFailures.uninstall);

// The library cannot function without certain browser features, and therefore
// neither can many of our tests.  If needed, install the Promise and
// CustomEvent polyfills.  In particular, this is needed on IE11.
beforeAll(function() {
  shaka.log.MAX_LOG_LEVEL = shaka.log.Level.ERROR;
  shaka.log.setLevel(shaka.log.MAX_LOG_LEVEL);

  shaka.polyfill.Promise.install();
  shaka.polyfill.CustomEvent.install();
});
