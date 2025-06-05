/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Karma configuration
// Install required modules by running "npm install"

// lodash is an indirect dependency, depended on by Karma
const _ = require('lodash');
const fs = require('fs');
const glob = require('glob');
const Jimp = require('jimp');
const rimraf = require('rimraf');
const {ssim} = require('ssim.js');
const util = require('karma/common/util');
const which = require('which');
const yaml = require('js-yaml');

/**
 * Like Object.assign, but recursive and doesn't clobber objects and arrays.
 * If two arrays are merged, they are concatenated.
 * Ex:
 *   mergeConfigs({ foo: 'bar', args: [1, 2, 3] },
 *                { baz: 'blah', args: [4, 5, 6] })
 *       => { foo: 'bar', baz: 'blah', args: [1, 2, 3, 4, 5, 6] }
 *
 * @param {Object} first
 * @param {Object} second
 * @return {Object}
 */
function mergeConfigs(first, second) {
  return _.mergeWith(
      first,
      second,
      (firstValue, secondValue) => {
        // Merge arrays by concatenation.
        if (Array.isArray(firstValue)) {
          return firstValue.concat(secondValue);
        }
        // Use lodash's default merge behavior for everything else.
        return undefined;
      });
}

/**
 * @param {Object} config
 */
module.exports = (config) => {
  const SHAKA_LOG_MAP = {
    none: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
    v1: 5,
    v2: 6,
  };

  const KARMA_LOG_MAP = {
    disable: config.LOG_DISABLE,
    error: config.LOG_ERROR,
    warn: config.LOG_WARN,
    info: config.LOG_INFO,
    debug: config.LOG_DEBUG,
  };

  // Find the settings JSON object in the command arguments
  const args = process.argv;
  const settingsIndex = args.indexOf('--settings');
  const settings =
      settingsIndex >= 0 ? JSON.parse(args[settingsIndex + 1]) : {};

  if (settings.grid_config) {
    const gridBrowserMetadata =
        yaml.load(fs.readFileSync(settings.grid_config, 'utf8'));
    const customLaunchers = {};
    const [gridHostname, gridPort] = settings.grid_address.split(':');
    console.log(`Using Selenium grid at ${gridHostname}:${gridPort}`);

    // By default, run on all grid browsers instead of the platform-specific
    // default.  This does not disable local browsers, though.  Users can still
    // specify a mix of grid and local browsers explicitly.
    settings.default_browsers = [];

    for (const name in gridBrowserMetadata) {
      if (name == 'vars') {
        // Skip variable defs in the YAML file
        continue;
      }

      const metadata = gridBrowserMetadata[name];

      const launcher = {};
      customLaunchers[name] = launcher;

      // Disabled-by-default browsers are still defined, but not put in the
      // default list.  A user can ask for one explicitly.  This allows us to
      // disable a browser that is down for some reason in the lab, but still
      // ask for it manually if we want to test it before re-enabling it for
      // everyone.
      if (!metadata.disabled) {
        settings.default_browsers.push(name);
      }

      // Add standard WebDriver configs.
      mergeConfigs(launcher, {
        base: 'WebDriver',
        config: {hostname: gridHostname, port: gridPort},
        pseudoActivityInterval: 20000,
        browserName: metadata.browser,
        platform: metadata.os,
        version: metadata.version,
      });

      if (metadata.extra_configs) {
        for (const config of metadata.extra_configs) {
          mergeConfigs(launcher, config);
        }
      }
    }

    config.set({
      customLaunchers: customLaunchers,
    });
  }

  if (settings.browsers && settings.browsers.length == 1 &&
      settings.browsers[0] == 'help') {
    console.log('Available browsers:');
    console.log('===================');
    for (const name of allUsableBrowserLaunchers(config)) {
      console.log('  ' + name);
    }
    process.exit(1);
  }

  // Resolve the set of browsers we will use.
  const browserSet = new Set(settings.browsers && settings.browsers.length ?
      settings.browsers : settings.default_browsers);
  if (settings.exclude_browsers) {
    for (const excluded of settings.exclude_browsers) {
      browserSet.delete(excluded);
    }
  }

  let browsers = Array.from(browserSet).sort();
  if (settings.no_browsers) {
    console.warn(
        '--no-browsers: In this mode, you must connect browsers to Karma.');
    browsers = null;
  } else {
    console.warn('Running tests on: ' + browsers.join(', '));
  }

  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: [
      'jasmine-ajax',
      'jasmine',
    ],

    middleware: [
      // An expressjs middleware, essentially a component that handles requests
      // in Karma's webserver.  This one is custom, and will let us take
      // screenshots of browsers connected through WebDriver.
      'webdriver-screenshot',

      // A "middleware" that lets us hook and augment the reporters with
      // additional information.
      'augment-reporters',
    ],

    plugins: [
      'karma-*',  // default plugins
      '@*/karma-*', // default scoped plugins

      {
        // An inline plugin which supplies the webdriver-screenshot middleware.
        'middleware:webdriver-screenshot': [
          'factory', WebDriverScreenshotMiddlewareFactory,
        ],

        // An inline plugin which augments the Reporter to add additional
        // information.
        'middleware:augment-reporters': [
          'factory', AugmentReportersFactory,
        ],
      },
    ],

    // list of files / patterns to load in the browser
    files: [
      // The Cast boot file must come first, to start the SDK and respond as
      // quickly as possible to the Cast platform.  Without this up front, we
      // tend to see the Chromecast time out and shut down the receiver that
      // hosts our tests.
      'test/test/cast-boot.js',

      // Polyfills before anything else, primarily for older TVs:
      //   Promise polyfill, required since we test uncompiled code on IE11
      'node_modules/es6-promise-polyfill/promise.js',
      //   Babel polyfill, required for async/await
      'node_modules/@babel/polyfill/dist/polyfill.js',

      // codem-isoboxer module next
      'node_modules/codem-isoboxer/dist/iso_boxer.min.js',

      // LCEVC decoder libraries (.wasm & .js)
      {
        pattern: 'node_modules/lcevc_dec.js/dist/liblcevc_dpi.wasm',
        included: false,
      },
      'node_modules/lcevc_dec.js/dist/lcevc_dec.min.js',

      // EME encryption scheme polyfill, compiled into Shaka Player, but outside
      // of the Closure deps system, so not in shaka-player.uncompiled.js.  This
      // is specifically the compiled, minified, cross-browser build of it.  It
      // is necessary to use the compiled version to avoid problems on older
      // TVs.
      // eslint-disable-next-line @stylistic/max-len
      'node_modules/eme-encryption-scheme-polyfill/dist/eme-encryption-scheme-polyfill.js',

      // load closure base, the deps tree, and the uncompiled library
      'test/test/closure-boot.js',
      'node_modules/google-closure-library/closure/goog/base.js',
      'dist/deps.js',
      'shaka-player.uncompiled.js',

      // the demo's config tab will register with shakaDemoMain, and will be
      // tested in test/demo/demo_unit.js
      'demo/config.js',

      // cajon module (an AMD variant of requirejs) next
      'node_modules/cajon/cajon.js',

      // define the test namespace next (shaka.test)
      'test/test/namespace.js',

      // test utilities next, which fill in that namespace
      'test/test/util/*.js',

      // bootstrapping for the test suite last; this will load the actual tests
      'test/test/boot.js',

      // if --test-custom-asset *is not* present, we will add unit tests.
      // if --quick *is not* present, we will add integration tests.
      // if --external *is* present, we will add external asset tests.

      // source files - these are only watched and served.
      // anything not listed here can't be dynamically loaded by other scripts.
      {pattern: 'lib/**/*.js', included: false},
      {pattern: 'ui/**/*.js', included: false},
      {pattern: 'ui/**/*.less', included: false},
      {pattern: 'third_party/**/*.js', included: false},
      {pattern: 'test/**/*.js', included: false},
      {pattern: 'test/test/assets/*', included: false},
      {pattern: 'test/test/assets/clear-encrypted/*', included: false},
      {pattern: 'test/test/assets/clear-encrypted-hls/*', included: false},
      {pattern: 'test/test/assets/dash-multi-codec/*', included: false},
      {pattern: 'test/test/assets/dash-multi-codec-ec3/*', included: false},
      {pattern: 'test/test/assets/3675/*', included: false},
      {pattern: 'test/test/assets/7401/*', included: false},
      {pattern: 'test/test/assets/6339/*', included: false},
      {pattern: 'test/test/assets/dash-aes-128/*', included: false},
      {pattern: 'test/test/assets/dash-audio-ac3/*', included: false},
      {pattern: 'test/test/assets/dash-clearkey/*', included: false},
      {pattern: 'test/test/assets/dash-mpd-alternate/*', included: false},
      {pattern: 'test/test/assets/dash-vr/*', included: false},
      {pattern: 'test/test/assets/dv-p8-hevc/*', included: false},
      {pattern: 'test/test/assets/dv-p10-av1/*', included: false},
      {pattern: 'test/test/assets/hls-aes-256/*', included: false},
      {pattern: 'test/test/assets/hls-interstitial/*', included: false},
      {pattern: 'test/test/assets/hls-muxed-mp4-ts/*', included: false},
      {pattern: 'test/test/assets/hls-raw-aac/*', included: false},
      {pattern: 'test/test/assets/hls-raw-ac3/*', included: false},
      {pattern: 'test/test/assets/hls-raw-ec3/*', included: false},
      {pattern: 'test/test/assets/hls-raw-mp3/*', included: false},
      {pattern: 'test/test/assets/hls-sample-aes/*', included: false},
      // eslint-disable-next-line @stylistic/max-len
      {pattern: 'test/test/assets/hls-text-no-discontinuity/*', included: false},
      {pattern: 'test/test/assets/hls-text-offset/*', included: false},
      {pattern: 'test/test/assets/hls-ts-aac/*', included: false},
      {pattern: 'test/test/assets/hls-ts-ac3/*', included: false},
      {pattern: 'test/test/assets/hls-ts-b-frames/*', included: false},
      {pattern: 'test/test/assets/hls-ts-ec3/*', included: false},
      {pattern: 'test/test/assets/hls-ts-h264/*', included: false},
      {pattern: 'test/test/assets/hls-ts-h265/*', included: false},
      {pattern: 'test/test/assets/hls-ts-mp3/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-aac-h264/*', included: false},
      // eslint-disable-next-line @stylistic/max-len
      {pattern: 'test/test/assets/hls-ts-muxed-aac-h264-with-overflow-nalus/*', included: false},
      // eslint-disable-next-line @stylistic/max-len
      {pattern: 'test/test/assets/hls-ts-muxed-aac-h264-with-overflow-samples/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-aac-h265/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-ac3-h264/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-mp3-h264/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-ec3-h264/*', included: false},
      {pattern: 'test/test/assets/hls-ts-muxed-opus-h264/*', included: false},
      {pattern: 'test/test/assets/hls-ts-raw-aac/*', included: false},
      {pattern: 'test/test/assets/hls-ts-rollover/*', included: false},
      {pattern: 'test/test/assets/lcevc-sei/*', included: false},
      {pattern: 'test/test/assets/lcevc-sei-ts/*', included: false},
      {pattern: 'test/test/assets/mss-clear/*', included: false},
      {pattern: 'test/test/assets/mss-playready/*', included: false},
      {pattern: 'dist/shaka-player.ui.js', included: false},
      {pattern: 'dist/locales.js', included: false},
      {pattern: 'demo/**/*.js', included: false},
      {pattern: 'demo/locales/en.json', included: false},
      {pattern: 'demo/locales/source.json', included: false},
      {pattern: 'node_modules/sprintf-js/src/sprintf.js', included: false},
      {pattern: 'node_modules/less/dist/less.js', included: false},
      {
        pattern: 'node_modules/fontfaceonload/dist/fontfaceonload.js',
        included: false,
      },
    ],

    // NOTE: Do not use proxies at all!  They cannot be used with the --hostname
    // option, which is necessary for some of our lab testing.
    proxies: {},

    // to avoid DISCONNECTED messages on Safari:
    browserDisconnectTimeout: 10 * 1000,  // 10s to reconnect
    browserDisconnectTolerance: 1,  // max of 1 disconnect is OK
    browserNoActivityTimeout: 5 * 60 * 1000,  // disconnect after 5m silence
    processKillTimeout: 5 * 1000,  // allow up to 5s for process to shut down
    captureTimeout: settings.capture_timeout,
    // https://support.saucelabs.com/customer/en/portal/articles/2440724

    client: {
      // Hide the list of connected clients in Karma, to make screenshots more
      // stable.
      clientDisplayNone: true,
      // Run directly in the top frame, instead of in an iframe.  This makes it
      // easier to work around cross-origin frame issues or frame permissions
      // issues when testing platforms like Chromecast, where there is already
      // an iframe involved in the test framework.
      useIframe: false,  // No iframe
      runInParent: true,  // No new window
      // Only capture the client's logs if the settings want logging.
      captureConsole: !!settings.logging && settings.logging != 'none',
      // |args| must be an array; pass a key-value map as the sole client
      // argument.
      args: [{
        // Run Player integration tests against external assets.
        // Skipped by default.
        external: !!settings.external,

        // Run Player integration tests against DRM license servers.
        // Skipped by default.
        drm: !!settings.drm,

        // Run quarantined tests which do not consistently pass.
        // Skipped by default.
        quarantined: !!settings.quarantined,

        // Run Player integration tests with uncompiled code for debugging.
        uncompiled: !!settings.uncompiled,

        // Limit which tests to run. If undefined, all tests should run.
        filter: settings.filter,

        // Set what level of logs for the player to print.
        logLevel: SHAKA_LOG_MAP[settings.logging],

        // Delay tests to aid in debugging async failures that pollute
        // subsequent tests.
        delayTests: settings.delay_tests,

        // Run playback tests on a custom manifest URI.
        testCustomAsset: settings.test_custom_asset,
        testCustomLicenseServer: settings.test_custom_license_server,

        // Overrides the default test timeout value.
        testTimeout: settings.test_timeout,

        // True if the test.py --grid_config option was used.
        runningInLab: !!settings.grid_config,

        // True if the test.py --running_in_vm option was used.
        runningInVM: !!settings.running_in_vm,
      }],
    },

    // Specify the hostname to be used when capturing browsers.
    hostname: settings.hostname,

    // Specify the port where the server runs.
    port: settings.port,

    // Set which browsers to run on. If this is null, then Karma will wait for
    // an incoming connection.
    browsers,

    // Enable / disable colors in the output (reporters and logs). Defaults
    // to true.
    colors: settings.colors,

    // Set Karma's level of logging.
    logLevel: KARMA_LOG_MAP[settings.log_level],

    // Should Karma execute tests whenever a file changes?
    autoWatch: settings.auto_watch,

    // Do a single run of the tests on captured browsers and then quit.
    // This is required when running tests without Karma's iframe.
    // (See useIframe above.)
    singleRun: true,

    // Set the time limit (ms) that should be used to identify slow tests.
    reportSlowerThan: settings.report_slower_than,

    // Force failure when running empty test-suites.
    failOnEmptyTestSuite: true,

    specReporter: {
      suppressSkipped: true,
      showBrowser: true,
    },
  });

  if (settings.babel) {
    config.set({
      preprocessors: {
        // Use babel to convert ES6 to ES5 so we can still run tests everywhere.
        // Use sourcemap to read inline source maps from babel into karma.
        'demo/**/*.js': ['babel', 'sourcemap'],
        'lib/**/*.js': ['babel', 'sourcemap'],
        'ui/**/*.js': ['babel', 'sourcemap'],
        'test/**/*.js': ['babel', 'sourcemap'],
        'third_party/**/*.js': ['babel', 'sourcemap'],
      },

      babelPreprocessor: {
        // Cache results in .babel-cache
        cachePath: '.babel-cache',
        options: {
          presets: ['@babel/preset-env'],
          // Add source maps so that backtraces refer to the original code.
          // Babel will output inline source maps, and the 'sourcemap'
          // preprocessor will read them and feed them to Karma.  Karma will
          // then use them to reformat stack traces in errors.
          sourceMap: 'inline',
          // Add instrumentation for code coverage.
          plugins: [
            ['istanbul', {
              // Don't instrument these parts of the codebase.
              exclude: [
                'demo/**/*.js',
                'lib/(debug|deprecate|polyfill)/*.js',
                'test/**/*.js',
                'third_party/**/*.js',
              ],
            }],
          ],
        },
      },
    });
  }

  const clientArgs = config.client.args[0];
  clientArgs.testFiles = [];

  if (settings.test_custom_asset) {
    // If testing custom assets, we don't serve other unit or integration tests.
    // External asset tests are the basis for custom asset testing, so this file
    // is automatically included.
    clientArgs.testFiles.push('demo/common/asset.js');
    clientArgs.testFiles.push('demo/common/assets.js');
    clientArgs.testFiles.push('test/player_external.js');
  } else {
    // In a normal test run, we serve unit tests.
    clientArgs.testFiles.push('test/**/*_unit.js');

    if (!settings.quick) {
      // If --quick is present, we don't serve integration tests.
      clientArgs.testFiles.push('test/**/*_integration.js');
    }
    if (settings.external) {
      // If --external is present, we serve external asset tests.
      clientArgs.testFiles.push('demo/common/asset.js');
      clientArgs.testFiles.push('demo/common/assets.js');
      clientArgs.testFiles.push('test/**/*_external.js');
    }
  }

  // These are the test files that will be dynamically loaded by boot.js.
  clientArgs.testFiles = resolveGlobs(clientArgs.testFiles);

  const reporters = [];

  if (settings.reporters) {
    // Explicit reporters, use these.
    reporters.push(...settings.reporters);
  } else if (settings.logging && settings.logging != 'none') {
    // With logging, default to 'spec', which makes logs easier to associate
    // with individual tests.
    reporters.push('spec');
  } else {
    // Without logging, default to 'progress'.
    reporters.push('progress');
  }

  if (settings.html_coverage_report) {
    // Wipe out any old coverage reports to avoid confusion.
    rimraf.sync('coverage', {});  // Like rm -rf

    config.set({
      coverageReporter: {
        includeAllSources: true,
        reporters: [
          {type: 'html', dir: 'coverage'},
          {type: 'cobertura', dir: 'coverage', file: 'coverage.xml'},
          {type: 'json-summary', dir: 'coverage', file: 'coverage.json'},
          {type: 'json', dir: 'coverage', file: 'coverage-details.json'},
        ],
      },
    });

    // The report requires the 'coverage' reporter to be added to the list.
    reporters.push('coverage');
  }

  config.set({reporters: reporters});

  if (reporters.includes('spec') && settings.spec_hide_passed) {
    config.set({specReporter: {suppressPassed: true}});
  }

  if (settings.random) {
    // If --seed was specified use that value, else generate a seed so that the
    // exact order can be reproduced if it catches an issue.
    const seed = settings.seed == null ? new Date().getTime() : settings.seed;

    // Run tests in a random order.
    clientArgs.random = true;
    clientArgs.seed = seed;

    console.log('Using a random test order (--random) with --seed=' + seed);
  }

  if (settings.tls_key && settings.tls_cert) {
    config.set({
      protocol: 'https',
      httpsServerOptions: {
        key: fs.readFileSync(settings.tls_key),
        cert: fs.readFileSync(settings.tls_cert),
      },
    });
  }
};

/**
 * Resolves a list of paths using globs into a list of explicit paths.
 * Paths are all relative to the source directory.
 *
 * @param {!Array<string>} list
 * @return {!Array<string>}
 */
function resolveGlobs(list) {
  const options = {
    cwd: __dirname,
  };

  const resolved = [];
  for (const path of list) {
    for (const resolvedPath of glob.sync(path, options)) {
      resolved.push(resolvedPath);
    }
  }
  return resolved;
}

/**
 * Determines which launchers and customLaunchers can be used and returns an
 * array of strings.
 *
 * @param {!Object} config
 * @return {!Array<string>}
 */
function allUsableBrowserLaunchers(config) {
  const browsers = [];

  // Load all launcher plugins.
  // The format of the items in this list is something like:
  // {
  //   'launcher:foo1': ['type', Function],
  //   'launcher:foo2': ['type', Function],
  // }
  // Where the launchers grouped together into one item were defined by a single
  // plugin, and the Functions in the inner array are the constructors for those
  // launchers.
  const plugins = require('karma/lib/plugin').resolve(['karma-*-launcher']);
  for (const map of plugins) {
    for (const name in map) {
      // Launchers should all start with 'launcher:', but occasionally we also
      // see 'test' come up for some reason.
      if (!name.startsWith('launcher:')) {
        continue;
      }

      const browserName = name.split(':')[1];
      const pluginConstructor = map[name][1];

      // Most launchers requiring configuration through customLaunchers have
      // no DEFAULT_CMD.  Some launchers have DEFAULT_CMD, but not for this
      // platform.  Finally, WebDriver has DEFAULT_CMD, but still requires
      // configuration, so we simply reject it by name.
      // eslint-disable-next-line no-restricted-syntax
      const DEFAULT_CMD = pluginConstructor.prototype.DEFAULT_CMD;
      if (!DEFAULT_CMD || !DEFAULT_CMD[process.platform]) {
        continue;
      }
      if (browserName == 'WebDriver') {
        continue;
      }

      // Now that we've filtered out the browsers that can't be launched without
      // custom config or that can't be launched on this platform, we filter out
      // the browsers you don't have installed.
      // eslint-disable-next-line no-restricted-syntax
      const ENV_CMD = pluginConstructor.prototype.ENV_CMD;
      const browserPath = process.env[ENV_CMD] || DEFAULT_CMD[process.platform];

      if (!fs.existsSync(browserPath) &&
          // cspell: disable-next-line
          !which.sync(browserPath, {nothrow: true})) {
        continue;
      }

      browsers.push(browserName);
    }
  }

  // Once we've found the names of all the standard launchers, add to that list
  // the names of any custom launcher configurations.
  if (config.customLaunchers) {
    browsers.push(...Object.keys(config.customLaunchers));
  }

  return browsers.sort();
}

/**
 * This is a factory for a "middleware" component that handles requests in
 * Karma's webserver.  This one will let us take screenshots of browsers
 * connected through WebDriver.  The factory uses Karma's dependency injection
 * system to get a reference to the launcher module, which we will use to get
 * access to the remote browsers.
 *
 * @param {karma.Launcher} launcher
 * @return {karma.Middleware}
 */
function WebDriverScreenshotMiddlewareFactory(launcher) {
  return screenshotMiddleware;

  /**
   * Extract URL params from the request.
   *
   * @param {express.Request} request
   * @return {!Object<string, string>}
   */
  function getParams(request) {
    // This can be null for manually-connected browsers.
    if (!request._parsedUrl.search) {
      return {};
    }
    return util.parseQueryParams(request._parsedUrl.search);
  }

  /**
   * Find the browser associated with the "id" parameter of the request.
   * This ID was assigned by Karma when the browser was launched, and passed to
   * the web server from the Jasmine tests.
   *
   * If the browser is not found, this function will return null.
   *
   * @param {?string} id
   * @return {karma.Launcher.Browser|null}
   */
  function getBrowser(id) {
    if (!id) {
      // No ID parameter?  No such browser.
      return null;
    }
    const browser = launcher._browsers.find((b) => b.id == id);
    if (!browser) {
      return null;
    }
    return browser;
  }

  /**
   * @param {?karma.Launcher.Browser} browser
   * @return {wd.remote|null} A WebDriver client, an object from the "wd"
   *   package, created by "wd.remote()".
   */
  function getWebDriverClient(browser) {
    if (!browser) {
      // If we didn't launch the browser, then there's definitely no WebDriver
      // client for it.
      return null;
    }

    // If this browser was launched by the WebDriver launcher, the launcher's
    // browser object has a WebDriver client in the "browser" field.  Yes, this
    // looks weird.
    const webDriverClient = browser.browser;

    // To make sure we have an actual WebDriver client and to screen out other
    // launchers who may also have a "browser" field in their browser object,
    // we check to make sure it has a screenshot method.
    if (webDriverClient && webDriverClient.takeScreenshot) {
      return webDriverClient;
    }
    return null;
  }

  /**
   * @param {karma.Launcher.Browser.spec} spec
   * @param {wd.remote} webDriverClient A WebDriver client, an object from the
   *   "wd" package, created by "wd.remote()".
   * @return {!Promise<!Buffer>} A Buffer containing a PNG screenshot
   */
  function getScreenshot(spec, webDriverClient) {
    return new Promise((resolve, reject) => {
      webDriverClient.takeScreenshot((error, pngBase64) => {
        if (error) {
          reject(error);
        } else if (pngBase64.error) {
          // In some failure cases, pngBase64 is an object with "error",
          // "message", and "stacktrace" fields.  This happens, for example,
          // with a timeout from the screenshot command.  This is not an
          // expected situation, so log it.  The extra newlines keep this from
          // being overwritten on the terminal when running tests against many
          // browsers at once.
          console.log('\n\nUnexpected screenshot failure:\n' +
              `  Error: ${JSON.stringify(pngBase64)}\n` +
              `  WebDriver spec: ${JSON.stringify(spec)}\n\n\n`);
          reject(pngBase64);
        } else {
          // Convert the screenshot to a binary buffer.
          resolve(Buffer.from(pngBase64, 'base64'));
        }
      });
    });
  }

  /**
   * Take a screenshot, write it to disk, and diff it against the old one.
   * Write the diff to disk, as well.
   *
   * @param {karma.Launcher.Browser} browser
   * @param {!Object<string, string>} params
   * @return {!Promise<number>} A similarity score between 0 and 1.
   */
  async function diffScreenshot(browser, params) {
    const webDriverClient = getWebDriverClient(browser);
    if (!webDriverClient) {
      throw new Error('No screenshot support!');
    }

    /** @type {!Buffer} */
    const fullPageScreenshotData =
        await getScreenshot(browser.spec, webDriverClient);

    // Crop the screenshot to the dimensions specified in the test.
    // Jimp is picky about types, so convert these strings to numbers.
    const x = parseFloat(params.x);
    const y = parseFloat(params.y);
    const width = parseFloat(params.width);
    const height = parseFloat(params.height);
    const bodyWidth = parseFloat(params.bodyWidth);
    const bodyHeight = parseFloat(params.bodyHeight);

    /** @type {!Jimp.image} */
    const fullScreenshot = (await Jimp.read(fullPageScreenshotData));

    // Because WebDriver may screenshot at a different resolution than we
    // saw in JS, convert the crop region coordinates to the screenshot scale,
    // then crop, then resize.  This order produces the most accurate cropped
    // screenshot.

    // Scaling by height breaks everything on Android, which has screenshots
    // that are taller than expected based on the body size.  So use width only.
    const scale = fullScreenshot.bitmap.width / bodyWidth;

    /** @type {!Jimp.image} */
    const newScreenshot = fullScreenshot.clone()
        .crop(
            // Sub-pixel rendering in browsers makes this much trickier than you
            // might expect.  Offsets are not necessarily integers even before
            // we scale them, but the image has been quantized into pixels at
            // that scale.  Experimentation with different rounding methods has
            // led to the conclusion that rounding up is the only way to get
            // consistent results.
            Math.ceil(x * scale),
            Math.ceil(y * scale),
            Math.ceil(width * scale),
            Math.ceil(height * scale))
        .resize(width, height, Jimp.RESIZE_BICUBIC);

    // Get the WebDriver spec (including browser name, platform, etc)
    const spec = browser.spec;
    // Compute the folder for the screenshots for this platform.
    const baseFolder = `${__dirname}/test/test/assets/screenshots`;
    let folder = `${baseFolder}/${spec.browserName}`;
    if (spec.platform) {
      folder += `-${spec.platform}`;
    }

    const oldScreenshotPath = `${folder}/${params.name}.png`;
    const fullScreenshotPath = `${folder}/${params.name}.png-full`;
    const newScreenshotPath = `${folder}/${params.name}.png-new`;
    const diffScreenshotPath = `${folder}/${params.name}.png-diff`;

    // Write the full screenshot to disk.  This should be done early in case a
    // later stage fails and we need to analyze what happened.
    fs.mkdirSync(folder, {recursive: true});
    fs.writeFileSync(
        fullScreenshotPath, await fullScreenshot.getBufferAsync('image/png'));

    // Write the cropped screenshot to disk next.  This is used in review
    // changes and to update the "official" screenshot when needed.
    fs.writeFileSync(
        newScreenshotPath, await newScreenshot.getBufferAsync('image/png'));

    /** @type {!Jimp.image} */
    let oldScreenshot;
    if (!fs.existsSync(oldScreenshotPath)) {
      // If the "official" screenshot doesn't exist yet, create a blank image
      // in memory.
      oldScreenshot = new Jimp(width, height);
    } else {
      oldScreenshot = await Jimp.read(oldScreenshotPath);
    }

    // Compare the new screenshot to the old one and produce a diff image.
    // Initially, the image data will be raw pixels, 4 bytes per pixel.
    // The threshold parameter affects the sensitivity of individual pixel
    // comparisons.  This diff is only used for visual review, not for
    // automated similarity checks, so the threshold setting is not so critical
    // as it used to be.
    const threshold = 0.10;
    const diff = Jimp.diff(oldScreenshot, newScreenshot, threshold);

    // Write the diff to disk.  This is used to review when there are changes.
    const fullSizeDiff =
        diff.image.clone().resize(width, height, Jimp.RESIZE_BICUBIC);
    fs.writeFileSync(
        diffScreenshotPath, await fullSizeDiff.getBufferAsync('image/png'));

    // Compare with a structural similarity algorithm.  This produces a
    // similarity score that we will use to pass or fail the test.
    const ssimResult = ssim(oldScreenshot.bitmap, newScreenshot.bitmap);
    return ssimResult.mssim;  // A score between 0 and 1.
  }

  /**
   * This function is the middleware.  It gets request and response objects and
   * a next() callback which passes control off to the next middleware in the
   * system.  This is similar to how expressjs works.
   *
   * @param {karma.MiddleWare.Request} request
   * @param {karma.MiddleWare.Response} response
   * @param {function()} next
   */
  async function screenshotMiddleware(request, response, next) {
    const pathname = request._parsedUrl.pathname;

    if (pathname == '/screenshot/isSupported') {
      const params = getParams(request);
      const browser = getBrowser(params.id);
      const webDriverClient = getWebDriverClient(browser);

      let isSupported = false;
      if (webDriverClient) {
        // Some platforms in our Selenium grid can't take screenshots.  We don't
        // have a good way to check for this in the platform capabilities
        // reported by Selenium, so we have to take a screenshot to find out.
        // The result is cached for the sake of performance.
        if (webDriverClient.canTakeScreenshot === undefined) {
          try {
            await getScreenshot(browser.spec, webDriverClient);
            webDriverClient.canTakeScreenshot = true;
          } catch (error) {
            webDriverClient.canTakeScreenshot = false;
          }
        }

        isSupported = webDriverClient.canTakeScreenshot;
      }

      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(isSupported));
    } else if (pathname == '/screenshot/diff') {
      const params = getParams(request);
      const browser = getBrowser(params.id);
      if (!browser) {
        response.writeHead(404);
        response.end('No such browser!');
        return;
      }

      // Check the URL parameters.
      const requiredParams = [
        'x', 'y', 'width', 'height', 'bodyWidth', 'bodyHeight', 'name',
      ];
      for (const k of requiredParams) {
        if (!params[k]) {
          response.writeHead(400);
          response.end(`Screenshot param ${k} is missing!`);
          return;
        }
      }

      // To avoid creating an open HTTP endpoint where anyone can write to any
      // path on the filesystem, only accept alphanumeric names (plus
      // underscore and dash).  No colons, periods, forward slashes, or
      // backslashes should ever be added to this regex, as any of those could
      // be used on some platform to write outside of the screenshots folder.
      if (!params.name.match(/[a-zA-Z0-9_-]+/)) {
        response.writeHead(400);
        response.end(`Screenshot name not valid: "${params.name}"`);
        return;
      }

      try {
        const pixelsChanged = await diffScreenshot(browser, params);
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(pixelsChanged));
      } catch (error) {
        console.error(error);
        response.writeHead(500);
        response.end('Screenshot error: ' + JSON.stringify(error));
      }
    } else {
      // Requests for paths that we don't handle are passed on to the next
      // middleware in the system.
      next();
    }
  }
}
WebDriverScreenshotMiddlewareFactory.$inject = ['launcher'];

/**
 * This is a factory for a "middleware" component that handles requests in
 * Karma's webserver.  We don't handle any actual requests here, but we use this
 * plugin to get access to the reporters through dependency injection and
 * augment them to display the number of tests left to be processed.
 *
 * This is useful when running tests locally on many browsers, since you can
 * see more clearly which browsers are still working and which are done.
 *
 * This could have been done through a fork of Karma itself, but this plugin
 * was clearer in some ways than using a fork of a now-extinct project.
 *
 * @param {!Array<karma.Reporter>} reporters
 * @param {string} settingsJson
 * @return {karma.Middleware}
 */
function AugmentReportersFactory(reporters, settingsJson) {
  const settings = JSON.parse(settingsJson);

  // Augment each reporter in the list.
  for (const reporter of reporters) {
    // Shim the renderBrowser function to add the number of test cases not yet
    // processed (passed, failed, or skipped).
    // The source we are patching: https://github.com/karma-runner/karma/blob/d8cf806e/lib/reporters/base.js#L37
    const orig = reporter.renderBrowser;
    reporter.renderBrowser = (browser) => {
      const results = browser.lastResult;
      const processed = results.success + results.failed + results.skipped;
      const left = results.total - processed;
      return orig(browser) + ` (${left} left)`;
    };

    // If we're not filtering explicitly, log any skipped tests.
    if (!settings.filter) {
      reporter.specSkipped = (browser, result) => {
        reporter.writeCommonMsg(result.fullName + ' SKIPPED\n');
      };
    }
  }

  // Return a dummy middleware that does nothing and chains to the next
  // middleware.
  return (request, response, next) => next();
}
AugmentReportersFactory.$inject = ['reporter._reporters', 'config.settings'];
