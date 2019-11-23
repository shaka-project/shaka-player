/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * Gets the value of an argument passed from karma.
 * @param {string} name
 * @return {?}
 */
function getClientArg(name) {
  if (window.__karma__ && __karma__.config.args.length) {
    return __karma__.config.args[0][name] || null;
  } else {
    return null;
  }
}


// Executed before test utilities and tests are loaded, but after Shaka Player
// is loaded in uncompiled mode.
(() => {
  // eslint-disable-next-line no-restricted-syntax
  const realAssert = console.assert.bind(console);

  /**
   * A version of assert() which hooks into jasmine and converts all failed
   * assertions into failed tests.
   * @param {*} condition
   * @param {string=} message
   */
  function jasmineAssert(condition, message) {
    realAssert(condition, message);
    if (!condition) {
      message = message || 'Assertion failed.';
      console.error(message);
      fail(message);
    }
  }
  goog.asserts.assert = jasmineAssert;
  console.assert = /** @type {?} */(jasmineAssert);

  // As of Feb 2018, this is only implemented in Chrome.
  // https://developer.mozilla.org/en-US/docs/Web/Events/unhandledrejection
  window.addEventListener('unhandledrejection', (event) => {
    /** @type {?} */
    const error = event.reason;
    let message = 'Unhandled rejection in Promise: ' + error;

    // Shaka errors have the stack trace in their toString() already, so don't
    // add it again.  For native errors, we need to see where it came from.
    if (error && error.stack && !(error instanceof shaka.util.Error)) {
      message += '\n' + error.stack;
    }
    fail(message);
  });

  // Use a RegExp if --specFilter is set, else empty string will match all.
  const specFilterRegExp = new RegExp(getClientArg('specFilter') || '');

  /**
   * A filter over all Jasmine specs.
   * @param {jasmine.Spec} spec
   * @return {boolean}
   */
  function specFilter(spec) {
    // If the browser is not supported, don't run the tests.
    // If the user specified a RegExp, only run the matched tests.
    // Running zero tests is considered an error so the test run will fail on
    // unsupported browsers or if the filter doesn't match any specs.
    return shaka.Player.isBrowserSupported() &&
        specFilterRegExp.test(spec.getFullName());
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
  Promise.resolve().then(() => {});

  const timeout = getClientArg('testTimeout');
  if (timeout) {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = Number(timeout);
  }

  const logLevel = getClientArg('logLevel');
  if (logLevel) {
    shaka.log.setLevel(Number(logLevel));
  } else {
    shaka.log.setLevel(shaka.log.Level.INFO);
  }

  // Set random and seed if specified.
  if (getClientArg('random')) {
    jasmine.getEnv().randomizeTests(true);

    const seed = getClientArg('seed');
    if (seed) {
      jasmine.getEnv().seed(seed.toString());
    }
  }

  /**
   * Returns a Jasmine callback which shims the real callback and checks for
   * a certain condition.  The test will only be run if the condition is true.
   *
   * @param {jasmine.Callback} callback  The test callback.
   * @param {function():*} cond
   * @param {?string} skipMessage  The message used when skipping a test; or
   *   null to not use pending().  This should only be null for before/after
   *   blocks.
   * @return {jasmine.Callback}
   */
  function filterShim(callback, cond, skipMessage) {
    return async () => {
      const val = await cond();
      if (!val) {
        if (skipMessage) {
          pending(skipMessage);
        }
        return;
      }

      if (callback.length) {
        // If this has a done callback, wrap in a Promise so we can await it.
        await new Promise((resolve) => callback(resolve));
      } else {
        // If this is an async test, this will wait for it to complete; if this
        // is a synchronous test, await will do nothing.
        await callback();
      }
    };
  }

  /**
   * Run a test that uses a DRM license server.
   *
   * @param {string} name
   * @param {jasmine.Callback} callback
   */
  window.drmIt = (name, callback) => {
    const shim = filterShim(
        callback, () => getClientArg('drm'),
        'Skipping tests that use a DRM license server.');
    it(name, shim);
  };

  /**
   * Run a test that has been quarantined.
   *
   * @param {string} name
   * @param {jasmine.Callback} callback
   */
  window.quarantinedIt = (name, callback) => {
    const shim = filterShim(
        callback, () => getClientArg('quarantined'),
        'Skipping tests that are quarantined.');
    it(name, shim);
  };

  /**
   * Run contained tests when the condition is true.
   *
   * @param {string} describeName  The name of the describe() block.
   * @param {function():*} cond A function for the condition; if this returns
   *   a truthy value, the tests will run, falsy will skip the tests.
   * @param {function()} describeBody The body of the describe() block.  This
   *   function will call before/after/it functions to define tests.
   */
  window.filterDescribe = (describeName, cond, describeBody) => {
    describe(describeName, () => {
      const old = {};
      for (const methodName of ['fit', 'it']) {
        old[methodName] = window[methodName];
        window[methodName] = (testName, testBody, ...rest) => {
          const shim = filterShim(
              testBody, cond, 'Skipping test due to platform support');
          return old[methodName](testName, shim, ...rest);
        };
      }
      const otherNames = ['afterAll', 'afterEach', 'beforeAll', 'beforeEach'];
      for (const methodName of otherNames) {
        old[methodName] = window[methodName];
        window[methodName] = (body, ...rest) => {
          const shim = filterShim(body, cond, null);
          return old[methodName](shim, ...rest);
        };
      }

      describeBody();

      for (const methodName in old) {
        window[methodName] = old[methodName];
      }
    });
  };

  beforeAll((done) => {  // eslint-disable-line no-restricted-syntax
    // Configure AMD modules and their dependencies.
    require.config({
      baseUrl: '/base/node_modules',
      packages: [
        {
          name: 'sprintf-js',
          main: 'src/sprintf',
        },
        {
          name: 'less',
          main: 'dist/less',
        },
      ],
    });

    // Load required AMD modules, then proceed with tests.
    require(['sprintf-js', 'less'],
        (sprintfJs, less) => {
          // These external interfaces are declared as "const" in the externs.
          // Avoid "const"-ness complaints from the compiler by assigning these
          // using bracket notation.
          window['sprintf'] = sprintfJs.sprintf;
          window['less'] = less;

          done();
        });
  });

  const originalSetTimeout = window.setTimeout;
  const delayTests = getClientArg('delayTests');
  if (delayTests) {
    afterEach((done) => {  // eslint-disable-line no-restricted-syntax
      console.log('Delaying test by ' + delayTests + ' seconds...');
      originalSetTimeout(done, delayTests * 1000);
    });
  }

  // Work-around: allow the Tizen media pipeline to cool down.
  // Without this, Tizen's pipeline seems to hang in subsequent tests.
  // TODO: file a bug on Tizen
  if (shaka.util.Platform.isTizen()) {
    afterEach((done) => {  // eslint-disable-line no-restricted-syntax
      originalSetTimeout(done, 100 /* ms */);
    });
  }

  // Code in karma-jasmine's adapter will malform test failures when the
  // expectation message contains a stack trace, losing the failure message and
  // mixing up the stack trace of the failure.  To avoid this, we modify
  // shaka.util.Error not to create a stack trace.  This trace is not available
  // in production, and there is never any need for it in the tests.
  // Shimming shaka.util.Error proved too complicated because of a combination
  // of compiler restrictions and ES6 language features, so this is by far the
  // simpler answer.
  shaka.util.Error.createStack = false;
})();
