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

// Executed before test utilities and tests are loaded, but after Shaka Player
// is loaded in uncompiled mode.
(function() {
  var realAssert = console.assert.bind(console);

  /**
   * A version of assert() which hooks into jasmine and converts all failed
   * assertions into failed tests.
   * @param {*} condition
   * @param {string=} opt_message
   */
  function jasmineAssert(condition, opt_message) {
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
  }
  goog.asserts.assert = jasmineAssert;
  console.assert = /** @type {?} */(jasmineAssert);

  /**
   * A filter over all Jasmine specs.
   * @param {jasmine.Spec} spec
   * @return {boolean}
   */
  function specFilter(spec) {
    // If the browser is not supported, don't run the tests.  Running zero tests
    // is considered an error so the test run will fail on unsupported browsers.
    return shaka.Player.isBrowserSupported();
  }
  jasmine.getEnv().specFilter = specFilter;

  // The spec filter callback occurs before calls to beforeAll, so we need to
  // install polyfills here to ensure that browser support is correctly
  // detected.
  shaka.polyfill.installAll();

  // Jasmine's clock mocks seem to interfere with Edge's Promise implementation.
  // This is only the case if Promises are first used after installing the mock.
  // As long as a then() callback on a Promise has happened once beforehand, it
  // seems to be OK.  I suspect Edge's Promise implementation is actually not in
  // native code, but rather something like a polyfill that binds to timer calls
  // the first time it needs to schedule something.
  Promise.resolve().then(function() {});

  // Set the default timeout to 120s for all asynchronous tests.
  jasmine.DEFAULT_TIMEOUT_INTERVAL = 120 * 1000;

  // This references test.Util, which isn't loaded yet, so defer to beforeAll:
  beforeAll(function() {
    var logLevel = shaka.test.Util.getClientArg('logLevel');
    if (logLevel) {
      shaka.log.setLevel(Number(logLevel));
    } else {
      shaka.log.setLevel(shaka.log.Level.INFO);
    }
  });
})();
