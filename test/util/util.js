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

goog.provide('shaka.test.Util');


/**
 * Processes some number of "instantaneous" operations.
 *
 * Instantaneous operations include Promise resolution (e.g.,
 * Promise.resolve()) and 0 second timeouts. This recursively processes
 * these operations, so if for example, one wrote
 *
 * Promise.resolve().then(function() {
 *   var callback = function() {
 *     Promise.resolve().then(function() {
 *       console.log('Hello world!');
 *     });
 *   }
 *   window.setTimeout(callback, 0);
 * });
 *
 * var p = processInstantaneousOperations(10);
 *
 * After |p| resolves, "Hello world!" will be written to the console.
 *
 * The parameter |n| controls the number of rounds to perform. This is
 * necessary since we cannot determine when there are no timeouts remaining
 * at the current time; to determine this we would require access to hidden
 * variables in Jasmine's Clock implementation.
 *
 * @param {number} n The number of rounds to perform.
 * @param {function(function(), number)} setTimeout
 * @return {!Promise}
 * TODO: Cleanup with patch to jasmine-core.
 */
shaka.test.Util.processInstantaneousOperations = function(n, setTimeout) {
  // This is not something we would do in the library, but this tiny hack is
  // needed here for testing.  On Edge, the delay needed here for Promises to
  // resolve is ~100ms.  On Safari, such a large delay is not only not needed,
  // it causes tests to timeout.  So we choose the delay based on the browser.
  var isEdge = navigator.userAgent.indexOf(' Edge/') >= 0;
  var delay = isEdge ? 100 : 5;
  var p = new shaka.util.PublicPromise();
  var inner = function() {
    jasmine.clock().tick(0);
    n -= 1;
    if (n <= 0) {
      p.resolve();
    } else {
      setTimeout(inner, delay);
    }
  };
  inner();
  return p;
};


/**
 * Fakes an event loop. Each tick processes some number of instantaneous
 * operations and advances the simulated clock forward by 1 second. Calls
 * opt_onTick just before each tick if it's specified.
 *
 * @param {number} duration The number of seconds of simulated time.
 * @param {function(function(), number)} setTimeout
 * @param {function(number)=} opt_onTick
 * @return {{ then: function(Function, Function=),
 *            stop: function() }}
 * Call stop() on the returned value to stop the loop early.  Call then()
 * to chain to the end of the loop like a Promise.
 */
shaka.test.Util.fakeEventLoop = function(duration, setTimeout, opt_onTick) {
  var async = Promise.resolve();
  var endLoop = false;
  for (var time = 0; time < duration; ++time) {
    async = async.then(function(currentTime) {
      if (endLoop) return;

      // We shouldn't need more than 6 rounds.
      var p = shaka.test.Util.processInstantaneousOperations(6, setTimeout);
      return p.then(function() {
        if (opt_onTick)
          opt_onTick(currentTime);
        jasmine.clock().tick(1000);
      });
    }.bind(null, time));
  }
  return {
    then: function(f, g) { return async.then(f, g); },
    stop: function() { endLoop = true; }
  };
};


/**
 * Capture a Promise's status and attach it to the Promise.
 * @param {!Promise} promise
 */
shaka.test.Util.capturePromiseStatus = function(promise) {
  promise.status = 'pending';
  promise.then(function() {
    promise.status = 'resolved';
  }, function() {
    promise.status = 'rejected';
  });
};


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @param {function(function(), number)=} opt_setTimeout
 * @return {!Promise}
 */
shaka.test.Util.delay = function(seconds, opt_setTimeout) {
  return new Promise(function(resolve, reject) {
    var timeout = opt_setTimeout || setTimeout;
    timeout(resolve, seconds * 1000.0);
  });
};


/**
 * @param {*} actual
 * @param {!Object} expected
 */
shaka.test.Util.expectToEqualError = function(actual, expected) {
  // NOTE: Safari will add extra properties to any thrown object, so we
  // wrap expectedError in jasmine.objectContaining to ignore them.
  // NOTE: We now add extra properties ourselves for the sake of formatting.
  // These, we delete from 'expected'.
  delete expected['stack'];
  delete expected['message'];
  expect(actual).toEqual(jasmine.objectContaining(expected));
};


/**
 * Gets the value of an argument passed from karma.
 * @param {string} name
 * @return {?string}
 */
shaka.test.Util.getClientArg = function(name) {
  if (window.__karma__ && __karma__.config.args.length)
    return __karma__.config.args[0][name] || null;
  else
    return null;
};


/**
 * Replace goog.asserts and console.assert with a version which hooks into
 * jasmine.  This converts all failed assertions into failed tests.
 */
var assertsToFailures = {
  uninstall: function() {
    goog.asserts.assert = assertsToFailures.originalGoogAssert_;
    console.assert = assertsToFailures.originalConsoleAssert_;
  },

  install: function() {
    assertsToFailures.originalGoogAssert_ = goog.asserts.assert;
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

    goog.asserts.assert = function(condition, opt_message) {
      jasmineAssert(condition, opt_message);
    };

    console.assert = /** @type {?} */ (jasmineAssert);
  }
};


(function() {  // Isolate access to specs.
  // Collect all specs.
  var allSpecs = [];
  jasmine.getEnv().specFilter = function(spec) {
    allSpecs.push(spec);
    return true;
  };

  shaka.test.Util.cancelAllRemainingSpecs = function() {
    allSpecs.forEach(function(spec) {
      if (spec.result.failedExpectations.length) {
        // Don't disable any specs which have already failed.
        return;
      }

      // You prevent a jasmine spec from running by marking it "pending".
      // This seems to be a misnomer, as it effectively cancels a spec.
      spec.pend();
    });
  };
})();


// Make sure assertions are converted into failures for all tests.
beforeAll(assertsToFailures.install);
afterAll(assertsToFailures.uninstall);

beforeAll(function() {
  var logLevel = shaka.test.Util.getClientArg('logLevel');
  if (logLevel)
    shaka.log.setLevel(Number(logLevel));
  else
    shaka.log.setLevel(shaka.log.Level.INFO);

  shaka.polyfill.installAll();

  // Jasmine's clock mocks seem to interfere with Edge's Promise implementation.
  // This is only the case if Promises are first used after installing the mock.
  // As long as a then() callback on a Promise has happened once beforehand, it
  // seems to be OK.  I suspect Edge's Promise implementation is actually not in
  // native code, but rather something like a polyfill that binds to timer calls
  // the first time it needs to schedule something.
  Promise.resolve().then(function() {});
});
