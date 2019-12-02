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

// Karma configuration
// Install required modules by running "npm install"

var fs = require('fs');
var path = require('path');
var rimraf = require('rimraf');
var which = require('which');

module.exports = function(config) {
  var SHAKA_LOG_MAP = {
    none: 0,
    error: 1,
    warning: 2,
    info: 3,
    debug: 4,
    v1: 5,
    v2: 6
  };

  var KARMA_LOG_MAP = {
    'disable': config.LOG_DISABLE,
    'error': config.LOG_ERROR,
    'warn': config.LOG_WARN,
    'info': config.LOG_INFO,
    'debug':  config.LOG_DEBUG
  };

  // Find the settings JSON object in the command arguments
  var args = process.argv;
  var settingsIndex = args.indexOf('--settings');
  var settings = settingsIndex >= 0 ? JSON.parse(args[settingsIndex + 1]) : {};

  if (settings.browsers && settings.browsers.length == 1 &&
      settings.browsers[0] == 'help') {
    console.log('Available browsers:');
    console.log('===================');
    allUsableBrowserLaunchers(config).forEach(function(name) {
      console.log('  ' + name);
    });
    process.exit(1);
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

    plugins: [
      'karma-*',  // default
    ],

    // list of files / patterns to load in the browser
    files: [
      // Polyfills first, primarily for IE 11 and older TVs:
      //   Promise polyfill, required since we test uncompiled code on IE11
      'node_modules/es6-promise-polyfill/promise.js',
      //   Babel polyfill, required for async/await
      'node_modules/babel-polyfill/dist/polyfill.js',

      // muxjs module next
      'node_modules/mux.js/dist/mux.min.js',

      // EME encryption scheme polyfill, compiled into Shaka Player, but outside
      // of the Closure deps system, so not in shaka-player.uncompiled.js.  This
      // is specifically the compiled, minified, cross-browser build of it.
      // eslint-disable-next-line max-len
      'node_modules/eme-encryption-scheme-polyfill/dist/eme-encryption-scheme-polyfill.js',

      // load closure base, the deps tree, and the uncompiled library
      'third_party/closure/goog/base.js',
      'dist/deps.js',
      'shaka-player.uncompiled.js',

      // cajon module (an AMD variant of requirejs) next
      'node_modules/cajon/cajon.js',

      // bootstrapping for the test suite
      'test/test/boot.js',

      // test utils next
      'test/test/util/*.js',

      // list of test assets next
      'demo/common/asset.js',
      'demo/common/assets.js',

      // if --test-custom-asset *is not* present, we will add unit tests.
      // if --quick *is not* present, we will add integration tests.
      // if --external *is* present, we will add external asset tests.

      // load relevant demo files
      {
        pattern: 'demo/!(main|load|demo_uncompiled|service_worker).js',
        included: true,
      },

      // source files - these are only watched and served
      {pattern: 'lib/**/*.js', included: false},
      {pattern: 'ui/**/*.js', included: false},
      {pattern: 'ui/**/*.less', included: false},
      {pattern: 'third_party/closure/goog/**/*.js', included: false},
      {pattern: 'third_party/language-mapping-list/*.js', included: false},
      {pattern: 'test/test/assets/*', included: false},
      {pattern: 'dist/shaka-player.ui.js', included: false},
      {pattern: 'dist/locales.js', included: false},
      {pattern: 'node_modules/**/*.js', included: false},
    ],

    // NOTE: Do not use proxies at all!  They cannot be used with the --hostname
    // option, which is necessary for some of our lab testing.
    proxies: {},

    preprocessors: {
      // Use babel to convert ES6 to ES5 so we can still run tests everywhere.
      // Use sourcemap to read inline source maps from babel into karma.
      'demo/**/*.js': ['babel', 'sourcemap'],
      'lib/**/*.js': ['babel', 'sourcemap'],
      'ui/**/*.js': ['babel', 'sourcemap'],
      'test/**/*.js': ['babel', 'sourcemap'],
      'third_party/language-mapping-list/*.js': ['babel', 'sourcemap'],
    },

    babelPreprocessor: {
      options: {
        presets: ['env'],
        // Add source maps so that backtraces refer to the original code.
        // Babel will output inline source maps, and the 'sourcemap'
        // preprocessor will read them and feed them to Karma.  Karma will then
        // use them to reformat stack traces in errors.
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

    // to avoid DISCONNECTED messages on Safari:
    browserDisconnectTimeout: 10 * 1000,  // 10s to reconnect
    browserDisconnectTolerance: 1,  // max of 1 disconnect is OK
    browserNoActivityTimeout: 5 * 60 * 1000,  // disconnect after 5m silence
    processKillTimeout: 5 * 1000,  // allow up to 5s for process to shut down
    captureTimeout: settings.capture_timeout,
    // https://support.saucelabs.com/customer/en/portal/articles/2440724

    client: {
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
        specFilter: settings.filter,

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
      }],
    },

    // Specify the hostname to be used when capturing browsers.
    hostname: settings.hostname,

    // Specify the port where the server runs.
    port: settings.port,

    // Set which browsers to run on. If this is null, then Karma will wait for
    // an incoming connection.
    browsers: settings.browsers,

    // Enable / disable colors in the output (reporters and logs). Defaults
    // to true.
    colors: settings.colors,

    // Set Karma's level of logging.
    logLevel: KARMA_LOG_MAP[settings.log_level],

    // Should Karma xecute tests whenever a file changes?
    autoWatch: settings.auto_watch,

    // Do a single run of the tests on captured browsers and then quit.
    // Defaults to true.
    singleRun: settings.single_run,

    // Set the time limit (ms) that should be used to identify slow tests.
    reportSlowerThan: settings.report_slower_than,

    // Force failure when running empty test-suites.
    failOnEmptyTestSuite: true,

    coverageReporter: {
      includeAllSources: true,
      reporters: [
        { type: 'text' },
      ],
    },

    specReporter: {
      suppressSkipped: true,
    },
  });

  function getClientArgs() {
    return config.client.args[0];
  }

  if (settings.test_custom_asset) {
    // If testing custom assets, we don't serve other unit or integration tests.
    // External asset tests are the basis for custom asset testing, so this file
    // is automatically included.
    config.files.push('test/player_external.js');
  } else {
    // In a normal test run, we serve unit tests.
    config.files.push('test/**/*_unit.js');

    if (!settings.quick) {
      // If --quick is present, we don't serve integration tests.
      config.files.push('test/**/*_integration.js');
    }
    if (settings.external) {
      // If --external is present, we serve external asset tests.
      config.files.push('test/**/*_external.js');
    }
  }
  // We just modified the config in-place.  No need for config.set() after we
  // push to config.files.

  var reporters = [];

  if (settings.reporters) {
    // Explicit reporters, use these.
    reporters.push.apply(reporters, settings.reporters);
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
        reporters: [
          { type: 'html', dir: 'coverage' },
          { type: 'cobertura', dir: 'coverage', file: 'coverage.xml' },
        ],
      },
    });

    // The report requires the 'coverage' reporter to be added to the list.
    reporters.push('coverage');
  }

  config.set({reporters: reporters});

  if (settings.random) {
    // If --seed was specified use that value, else generate a seed so that the
    // exact order can be reproduced if it catches an issue.
    var seed = settings.seed == null ? new Date().getTime() : settings.seed;

    // Run tests in a random order.
    getClientArgs().random = true;
    getClientArgs().seed = seed;

    console.log("Using a random test order (--random) with --seed=" + seed);
  }
};

// Determines which launchers and customLaunchers can be used and returns an
// array of strings.
function allUsableBrowserLaunchers(config) {
  var browsers = [];

  // Load all launcher plugins.
  // The format of the items in this list is something like:
  // {
  //   'launcher:foo1': ['type', Function],
  //   'launcher:foo2': ['type', Function],
  // }
  // Where the launchers grouped together into one item were defined by a single
  // plugin, and the Functions in the inner array are the constructors for those
  // launchers.
  var plugins = require('karma/lib/plugin').resolve(['karma-*-launcher']);
  plugins.forEach(function(map) {
    Object.keys(map).forEach(function(name) {
      // Launchers should all start with 'launcher:', but occasionally we also
      // see 'test' come up for some reason.
      if (!name.startsWith('launcher:')) return;

      var browserName = name.split(':')[1];
      var pluginConstructor = map[name][1];

      // Most launchers requiring configuration through customLaunchers have
      // no DEFAULT_CMD.  Some launchers have DEFAULT_CMD, but not for this
      // platform.  Finally, WebDriver has DEFAULT_CMD, but still requires
      // configuration, so we simply blacklist it by name.
      var DEFAULT_CMD = pluginConstructor.prototype.DEFAULT_CMD;
      if (!DEFAULT_CMD || !DEFAULT_CMD[process.platform]) return;
      if (browserName == 'WebDriver') return;

      // Now that we've filtered out the browsers that can't be launched without
      // custom config or that can't be launched on this platform, we filter out
      // the browsers you don't have installed.
      var ENV_CMD = pluginConstructor.prototype.ENV_CMD;
      var browserPath = process.env[ENV_CMD] || DEFAULT_CMD[process.platform];

      if (!fs.existsSync(browserPath) &&
          !which.sync(browserPath, {nothrow: true})) return;

      browsers.push(browserName);
    });
  });

  // Once we've found the names of all the standard launchers, add to that list
  // the names of any custom launcher configurations.
  if (config.customLaunchers) {
    browsers.push.apply(browsers, Object.keys(config.customLaunchers));
  }

  return browsers;
}
