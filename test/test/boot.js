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

/**
 * Make failed assertions trigger a test failure.
 */
function failTestsOnFailedAssertions() {
  let realAssert = console.assert.bind(console);

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
      try {
        throw new Error(message);
      } catch (exception) {
        fail(message);
      }
    }
  }
  goog.asserts.assert = jasmineAssert;
  console.assert = /** @type {?} */(jasmineAssert);
}

/**
 * Patches a function on Element to fail an assertion if we use a namespaced
 * name on it.  We should use the namespace-aware versions instead.
 */
function failTestsOnNamespacedElementOrAttributeNames() {
  const patchElementNamespaceFunction = (name) => {
    // eslint-disable-next-line no-restricted-syntax
    const real = Element.prototype[name];
    /** @this {Element} @suppress {lintChecks} */
    // eslint-disable-next-line no-restricted-syntax
    Element.prototype[name] = function(arg) {
      // Ignore xml: namespaces since it's builtin.
      if (!arg.startsWith('xml:') && !arg.startsWith('xmlns:') &&
          arg.includes(':')) {
        fail('Use namespace-aware ' + name);
      }
      // eslint-disable-next-line no-restricted-syntax
      return real.apply(this, arguments);
    };
  };

  patchElementNamespaceFunction('getAttribute');
  patchElementNamespaceFunction('hasAttribute');
  patchElementNamespaceFunction('getElementsByTagName');
}

/**
 * Listen for unhandled Promise rejections (which may occur after a test) and
 * convert them into test failures.
 */
function failTestsOnUnhandledRejections() {
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
}

/**
 * Work around issues with legacy Edge's Promise implementation.
 */
function workAroundLegacyEdgePromiseIssues() {
  // Jasmine's clock mocks seem to interfere with legacy Edge's Promise
  // implementation.  This is only the case if Promises are first used after
  // installing the mock.  As long as a then() callback on a Promise has
  // happened once beforehand, it seems to be OK.  I suspect Edge's Promise
  // implementation is actually not in native code, but rather something like a
  // polyfill that binds to timer calls the first time it needs to schedule
  // something.
  Promise.resolve().then(() => {});
}

/**
 * Returns a Jasmine callback which shims the real callback and checks for
 * a certain client arg.  The test will only be run if that argument is
 * specified on the command-line.
 *
 * @param {jasmine.Callback} callback  The test callback.
 * @param {string} clientArg  The command-line arg that must be present.
 * @param {string} skipMessage  The message used when skipping a test.
 * @return {jasmine.Callback}
 */
function filterShim(callback, clientArg, skipMessage) {
  return async function() {
    if (!getClientArg(clientArg)) {
      pending(skipMessage);
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
window.drmIt = function(name, callback) {
  it(name, filterShim(callback, 'drm',
      'Skipping tests that use a DRM license server.'));
};

/**
 * Run a test that has been quarantined.
 *
 * @param {string} name
 * @param {jasmine.Callback} callback
 */
window.quarantinedIt = function(name, callback) {
  it(name, filterShim(callback, 'quarantined',
      'Skipping tests that are quarantined.'));
};

/**
 * Load node modules used in testing and install them into window.
 * @return {!Promise}
 */
function loadNodeModules() {
  return new Promise((resolve) => {
    // Configure AMD modules and their dependencies.
    require.config({
      baseUrl: '/base/node_modules',
      packages: [
        {
          name: 'promise-mock',
          main: 'lib/index',
        },
        {
          name: 'promise-polyfill',  // Used by promise-mock.
          main: 'lib/index',
        },
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
    require(['promise-mock', 'sprintf-js', 'less'],
        (PromiseMock, sprintfJs, less) => {
      // These external interfaces are declared as "const" in the externs.
      // Avoid "const"-ness complaints from the compiler by assigning these
      // using bracket notation.
      window['PromiseMock'] = PromiseMock;
      window['sprintf'] = sprintfJs.sprintf;
      window['less'] = less;

      // Patch a new convenience method into PromiseMock.
      // See https://github.com/taylorhakes/promise-mock/issues/7
      PromiseMock.flush = () => {
        // Pass strict == false so it does not throw.
        PromiseMock.runAll(false /* strict */);
      };

      resolve();
    });
  });
}

/**
 * Apply Jasmine settings and set up anything else needed by the testing
 * environment.
 */
function configureJasmineEnvironment() {
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

  // Ensure node modules are loaded before any tests execute.
  beforeAll(async () => {
    await loadNodeModules();
  });

  const originalSetTimeout = window.setTimeout;
  const delayTests = getClientArg('delayTests');
  if (delayTests) {
    afterEach((done) => {
      console.log('Delaying test by ' + delayTests + ' seconds...');
      originalSetTimeout(done, delayTests * 1000);
    });
  }

  // Work-around: allow the Tizen media pipeline to cool down.
  // Without this, Tizen's pipeline seems to hang in subsequent tests.
  // TODO: file a bug on Tizen
  if (shaka.util.Platform.isTizen()) {
    afterEach((done) => {
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

  // Use a RegExp if --specFilter is set, else empty string will match all.
  let specFilterRegExp = new RegExp(getClientArg('specFilter') || '');

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

  // Set random and seed if specified.
  if (getClientArg('random')) {
    jasmine.getEnv().randomizeTests(true);

    let seed = getClientArg('seed');
    if (seed) {
      jasmine.getEnv().seed(seed.toString());
    }
  } else {
    jasmine.getEnv().randomizeTests(false);
  }
}

// Executed before test utilities and tests are loaded, but after Shaka Player
// is loaded in uncompiled mode.
try {
  failTestsOnFailedAssertions();
  failTestsOnNamespacedElementOrAttributeNames();
  failTestsOnUnhandledRejections();
  workAroundLegacyEdgePromiseIssues();

  // The spec filter callback occurs before calls to beforeAll, so we need to
  // install polyfills here to ensure that browser support is correctly
  // detected.
  shaka.polyfill.installAll();

  configureJasmineEnvironment();

  // eslint-disable-next-line no-restricted-syntax
} catch (error) {
  /**
   * Throw this boot-sequence error in place of jasmine's execute method, to
   * fail clearly and right away without running any tests.
   */
  jasmine.getEnv().execute = () => {
    throw error;
  };
}
