/*! @license
 * Shaka Player
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

function failTestsOnFailedAssertions() {
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
}

/**
 * Patches a function on Element to fail an assertion if we use a namespaced
 * name on it.  We should use the namespace-aware versions instead.
 */
function failTestsOnNamespacedElementOrAttributeNames() {
  const patchElementNamespaceFunction = (name) => {
    // eslint-disable-next-line no-restricted-syntax
    const real = Element.prototype[name];
    /**
     * @this {Element}
     * @param {string} arg
     * @return {*}
     */
    // eslint-disable-next-line no-restricted-syntax
    Element.prototype[name] = function(arg) {
      // Ignore xml: namespaces since it's builtin.
      if (!arg.startsWith('xml:') && !arg.startsWith('xmlns:') &&
          arg.includes(':')) {
        fail('Use namespace-aware ' + name);
      }
      return real.apply(this, arguments);
    };
  };

  patchElementNamespaceFunction('getAttribute');
  patchElementNamespaceFunction('hasAttribute');
  patchElementNamespaceFunction('getElementsByTagName');
}

/**
 * Fail the current test on a given error, constructed with a given header and
 * the full stack trace of the error.
 *
 * @param {string} messageHeader
 * @param {!Error} error
 */
function failOnError(messageHeader, error) {
  let message = `${messageHeader}: ${error}`;
  // Shaka errors have the stack trace in their toString() already, so don't
  // add it again.  For native errors, we need to see where it came from.
  if (error && error.stack && !(error instanceof shaka.util.Error)) {
    message += '\n' + error.stack;
  }
  fail(message);
}

/**
 * Listen for unhandled errors and Promise rejections (which may occur after a
 * test) and convert them into test failures.
 */
function failTestsOnUnhandledErrors() {
  // https://developer.mozilla.org/en-US/docs/Web/Events/unhandledrejection
  window.addEventListener('unhandledrejection', (event) => {
    /** @type {?} */
    const error = event.reason;
    failOnError('Unhandled rejection in Promise', error);
  });

  // https://developer.mozilla.org/en-US/docs/Web/API/Window/error_event
  // https://developer.mozilla.org/en-US/docs/Web/API/ErrorEvent
  window.addEventListener('error', (event) => {
    if (typeof event == 'string') {
      // Since we moved to a flat (frameless) testing environment, we sometimes
      // get error "events" on Chromecast where we only get the string "Script
      // error." instead of an actual event object.  This would be consistent
      // with an unhandled error thrown by a cross-origin script (such as the
      // Cast SDK), but this string-only form should only be sent to the
      // onerror callback and not the 'error' event listener.  This is both a
      // bug in the SDK (unhandled error) and in the platform (called event
      // listener with wrong format).  We ignore it here.
      console.log('Suppressing error event with only string:', event);
      return;
    }

    /** @type {?} */
    const error = event['error'];
    if (!error) {
      // Since we moved to a flat (frameless) testing environment, we sometimes
      // get error events on Chromecast where the error field is null.  It's not
      // clear why.  Ignore these.
      console.log('Suppressing error event with no error:', event);
      return;
    }

    failOnError('Unhandled error', error);
  });
}

/**
 * Scrollbars ruin our screenshots, in particular on Safari.  Disable all
 * scrollbars in CSS to ensure consistent screenshots.
 */
function disableScrollbars() {
  // In the past, we had applied fixed offsets to the width on Safari to account
  // for scrollbars and correct the scaling factor, but this was a hack and
  // inconsistent.  The best thing to do is completely disable scrollbars
  // through CSS.  This ensures that neither the inner iframe nor the top-level
  // window have scrollbars, which makes screenshots on Safari consistent across
  // versions.

  // Disable scrolling on the inner document, the execution context.
  const innerStyle = document.createElement('style');
  innerStyle.innerText = '::-webkit-scrollbar { display: none; }\n';
  innerStyle.innerText += 'body { overflow: hidden }\n';
  document.head.appendChild(innerStyle);

  try {
    // Disable scrolling on the outer document, the host context.
    const outerStyle = document.createElement('style');
    outerStyle.innerText = innerStyle.innerText;
    top.document.head.appendChild(outerStyle);

    // eslint-disable-next-line no-restricted-syntax
  } catch (error) {
    // On some platforms (Tizen), we are prevented from accessing the host
    // context, even though it should be in the same origin.  Ignore errors
    // here, so that the rest of the critical boot sequence can complete.
  }
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
 * Work around lab crashes by flagging if we're running in the lab.  This lets
 * us add lab-specific workarounds for our unique lab environment.  This won't
 * affect local test runs on developer machines or GitHub Actions workflows.
 */
function workAroundLabCrashes() {
  shaka.debug.RunningInLab = getClientArg('runningInLab');
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

/**
 * Unconditionally skip contained tests that would normally be run
 * conditionally.  Used to temporarily disable tests that use filterDescribe.
 * See filterDescribe above.
 *
 * @param {string} describeName
 * @param {function():*} cond
 * @param {function()} describeBody
 */
window.xfilterDescribe = (describeName, cond, describeBody) => {
  const oldDescribe = window['describe'];
  window['describe'] = window['xdescribe'];
  filterDescribe(describeName, cond, describeBody);
  window['describe'] = oldDescribe;
};

/**
 * A very short alias for filtering offline integration tests.
 *
 * @return {boolean}
 */
window.offlineSupported = () => {
  return shaka.offline.StorageMuxer.support();
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
          name: 'sprintf-js',
          main: 'src/sprintf',
        },
        {
          name: 'less',
          main: 'dist/less',
        },
        {
          name: 'fontfaceonload',
          main: 'dist/fontfaceonload',
        },
      ],
    });

    // Load required AMD modules, then proceed with tests.
    require(['sprintf-js', 'less', 'fontfaceonload'],
        (sprintfJs, less, FontFaceOnload) => {
          // These external interfaces are declared as "const" in the externs.
          // Avoid "const"-ness complaints from the compiler by assigning these
          // using bracket notation.
          window['sprintf'] = sprintfJs.sprintf;
          window['less'] = less;
          window['FontFaceOnload'] = FontFaceOnload;

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

  beforeAll(async () => {
    // Ensure node modules are loaded before any tests execute.
    await loadNodeModules();

    // Replace jasmine's global error handler, since we have our own more
    // nuanced version.  You can't set this to null, since jasmine still tries
    // to call it.  Note also that our handler uses window.addEventListener
    // instead of window.onerror.
    window.onerror = () => {};
  });

  const originalSetTimeout = window.setTimeout;
  const delayTests = getClientArg('delayTests');
  if (delayTests) {
    afterEach((done) => {  // eslint-disable-line no-restricted-syntax
      console.log('Delaying test by ' + delayTests + ' seconds...');
      originalSetTimeout(done, delayTests * 1000);
    });
  }

  const originalDevice = shaka.device.DeviceFactory.getDevice();
  goog.asserts.assert(originalDevice, 'device must be non-null');
  window.dump(originalDevice.toString());
  window.deviceDetected = originalDevice;

  afterEach(/** @suppress {accessControls} */ () => {
    goog.asserts.assert(originalDevice, 'device must be non-null');
    window.deviceDetected = originalDevice;
    // Reset decoding config cache after each test.
    shaka.util.StreamUtils.clearDecodingConfigCache();
    shaka.media.Capabilities.MediaSourceTypeSupportMap.clear();
  });

  // Code in karma-jasmine's adapter will malform test failures when the
  // expectation message contains a stack trace, losing the failure message and
  // mixing up the stack trace of the failure.  To avoid this, we modify
  // shaka.util.Error not to create a stack trace.  There is never any need for
  // this trace in the tests.
  // Shimming shaka.util.Error proved too complicated because of a combination
  // of compiler restrictions and ES6 language features, so this is by far the
  // simpler answer.
  shaka.util.Error.createStack = false;

  // Shim Jasmine's execute function.  The karma-jasmine adapter will configure
  // jasmine in a way that prevents us from setting our own specFilter config.
  // There is no configuration that will stop karma-jasmine from doing this.
  // So we hook into Jasmine's execute function (the last step of
  // karma-jasmine's startup) to set our own config first.
  // See also https://github.com/karma-runner/karma-jasmine/issues/273
  /** @type {!jasmine.Env} */
  const jasmineEnv = jasmine.getEnv();
  // eslint-disable-next-line no-restricted-syntax
  const originalJasmineExecute = jasmineEnv.execute.bind(jasmineEnv);
  jasmineEnv.execute = () => {
    // Use a RegExp if --filter is set, else empty string will match all.
    const specFilterRegExp = new RegExp(getClientArg('filter') || '');
    const isBrowserSupported = shaka.Player.isBrowserSupported();

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
      return isBrowserSupported && specFilterRegExp.test(spec.getFullName());
    }

    // Set jasmine config.
    const jasmineConfig = {
      specFilter,
      random: !!getClientArg('random'),
      seed: getClientArg('seed'),
    };

    jasmineEnv.configure(jasmineConfig);
    originalJasmineExecute();
  };
}

async function checkSupport() {
  try {
    const startMs = Date.now();
    window.shakaSupport = await shaka.Player.probeSupport();
    const endMs = Date.now();
    // Bypass Karma's log settings and dump this to the console.
    window.dump('Platform support: ' + JSON.stringify(shakaSupport, null, 2));
    window.dump(`Platform support check took ${endMs - startMs} ms.`);
    // eslint-disable-next-line no-restricted-syntax
  } catch (error) {
    window.dump('Support check failed at boot: ' + error);
  }
}

/**
 * Check if ClearKey CENC is supported.
 * @return {boolean}
 */
function checkClearKeySupport() {
  const clearKeySupport = shakaSupport.drm['org.w3.clearkey'];
  if (!clearKeySupport) {
    return false;
  }
  return clearKeySupport.encryptionSchemes.includes('cenc');
}

/**
 * Check if PlayReady is supported.
 * @return {boolean}
 */
function checkPlayReadySupport() {
  if (shakaSupport.drm['com.microsoft.playready'] ||
      shakaSupport.drm['com.microsoft.playready.recommendation'] ||
      shakaSupport.drm['com.microsoft.playready.recommendation.3000']) {
    return true;
  }
  return false;
}

/**
 * Check if Widevine is supported.
 * @return {boolean}
 */
function checkWidevineSupport() {
  if (shakaSupport.drm['com.widevine.alpha']) {
    return true;
  }
  return false;
}

/**
 * Check if FairPlay is supported.
 * @return {boolean}
 */
function checkFairPlaySupport() {
  if (shakaSupport.drm['com.apple.fps'] && !getClientArg('runningInVM')) {
    return true;
  }
  return false;
}

/**
 * Check if Widevine with persistence state is supported.
 * @return {boolean}
 */
function checkWidevinePersistentSupport() {
  const widevine = shakaSupport.drm['com.widevine.alpha'];
  if (!widevine) {
    return false;
  }
  return widevine.persistentState;
}

/**
 * Check if Widevine and/or PlayReady are supported.
 * @return {boolean}
 */
function checkTrueDrmSupport() {
  // We don't include FairPlay because our test assets aren't ready to use it.
  return checkWidevineSupport() || checkPlayReadySupport();
}

/**
 * Set up the Shaka Player test environment.
 * @return {!Promise}
 */
async function setupTestEnvironment() {
  failTestsOnFailedAssertions();
  failTestsOnNamespacedElementOrAttributeNames();
  failTestsOnUnhandledErrors();
  disableScrollbars();
  workAroundLegacyEdgePromiseIssues();
  workAroundLabCrashes();

  // The spec filter callback occurs before calls to beforeAll, so we need to
  // install polyfills here to ensure that browser support is correctly
  // detected.
  shaka.polyfill.installAll();

  await checkSupport();

  configureJasmineEnvironment();
}

/**
 * Load a script dynamically and await completion.
 *
 * @param {string} file
 * @return {!Promise}
 */
function loadScript(file) {
  return new Promise((resolve, reject) => {
    const script = /** @type {!HTMLScriptElement} */(
      document.createElement('script'));
    script.defer = false;
    script['async'] = false;
    script.onload = resolve;
    script.onerror = reject;
    script.setAttribute('src', '/base/' + file);
    document.head.appendChild(script);
  });
}

/**
 * Load all test scripts and await completion.
 *
 * @return {!Promise}
 */
function loadTests() {
  const loadPromises = [];
  for (const file of getClientArg('testFiles')) {
    loadPromises.push(loadScript(file));
  }
  return Promise.all(loadPromises);
}

// Hijack Karma's start() method and start things our way.
// eslint-disable-next-line no-restricted-syntax
const originalStart = window.__karma__.start.bind(window.__karma__);
window.__karma__.start = async () => {
  // Executed when Karma has finished loading everything it loads for us.
  // Those things were all loaded in parallel, and had no interdependencies
  // other than those in the Shaka Player library, tracked by the Closure
  // library's goog.require/goog.provide.

  // Now we load the tests from here, rather than letting Karma do it.  This
  // give us control over the order, so that everything else is loaded and
  // complete before any tests are requested.  Then we may reference test
  // utilities and library namespaces in the body of describe() blocks, which
  // are executed synchronously as the test scripts are loaded.  Without this
  // ordering, we would have to either:
  //    1. very carefully avoid references in describe() and defer them to
  //       beforeAll()
  // or 2. strictly adopt goog.provide/goog.require throughout our tests
  // In those scenarios, failure to do so would only manifest some of the time
  // and on certain platforms.  So this seems to be the more robust solution.

  // See https://github.com/shaka-project/shaka-player/issues/4094

  try {
    await setupTestEnvironment();
    console.log('Set up test environment.');
    await loadTests();
    console.log('Loaded all tests.');

    // eslint-disable-next-line no-restricted-syntax
  } catch (error) {
    window.dump('Error during setup: ' + error);
    window.__karma__.error(error);
    return;
  }

  // Finally, start the tests.
  originalStart();
};
