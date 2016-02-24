// Karma configuration
// Install required modules by running "npm install"

module.exports = function(config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: [
      'jasmine-ajax', 'jasmine',
      'sprintf-js',
    ],

    plugins: [
      'karma-*',  // default
      frameworkPluginForModule('sprintf-js'),
    ],

    // list of files / patterns to load in the browser
    files: [
      // closure base first
      'third_party/closure/goog/base.js',

      // deps next
      'dist/deps.js',
      'shaka-player.uncompiled.js',

      // test utils next
      'test/util/*.js',

      // support test first
      'test/support_check.js',

      // unit tests last
      'test/*_unit.js',

      // if --quick is not present, we will add integration tests.

      // source files - these are only watched and served
      {pattern: 'lib/**/*.js', included: false},
      {pattern: 'test/assets/*', included: false},
      {pattern: 'third_party/closure/goog/**/*.js', included: false},
    ],

    proxies: {
      '/test/assets/': '/base/test/assets/',
    },

    preprocessors: {
      // Don't compute coverage over lib/debug/ or lib/polyfill/
      'lib/!(debug|polyfill)/*.js': 'coverage',
      // Player is not matched by the above, so add it explicitly
      'lib/player.js': 'coverage',
    },

    coverageReporter: {
      reporters: [
        { type: 'text' },
      ],
    },

    // do not panic about "no activity" unless a test takes longer than 120s.
    // this value must be greater than any jasmine.DEFAULT_TIMEOUT_INTERVAL used
    // in test cases. (eg. 90s in test/streaming_engine_integration.js)
    browserNoActivityTimeout: 120000,

    client: {
      // don't capture the client's console logs
      captureConsole: false,
      // |args| must be an array; pass a key-value map as the sole client
      // argument.
      args: [{}],
    },

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR ||
    //                  config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_WARN,

    // do not execute tests whenever any file changes
    autoWatch: false,

    // do a single run of the tests on captured browsers and then quit
    singleRun: true,

    customLaunchers: {
      // BrowserStack launchers require login information in the form of
      // the environment variables BROWSER_STACK_USERNAME and
      // BROWSER_STACK_ACCESS_KEY.

      // NOTE: PlayReady not working on BrowserStack IE11.  We are waiting for
      // a response from BrowserStack support.
      BrowserStack_IE11: {
        base: 'BrowserStack',
        browser: 'ie',
        browser_version: '11.0',
        os: 'Windows',
        os_version: '8.1',
      },

      BrowserStack_Edge12: {
        base: 'BrowserStack',
        browser: 'edge',
        browser_version: '12.0',
        os: 'Windows',
        os_version: '10',
      },

      BrowserStack_Edge13: {
        base: 'BrowserStack',
        browser: 'edge',
        browser_version: '13.0',
        os: 'Windows',
        os_version: '10',
      },

      BrowserStack_Safari8: {
        base: 'BrowserStack',
        browser: 'safari',
        browser_version: '8.0',
        os: 'OS X',
        os_version: 'Yosemite',
      },

      BrowserStack_Safari9: {
        base: 'BrowserStack',
        browser: 'safari',
        browser_version: '9.0',
        os: 'OS X',
        os_version: 'El Capitan',
      },

      WebDriver_Safari8: {
        base: 'WebDriver',
        config: {hostname: 'localhost', port: 4444},
        browserName: 'safari',
        pseudoActivityInterval: 20000
      },

      WebDriver_Safari9: {
        base: 'WebDriver',
        config: {hostname: 'localhost', port: 4445},
        browserName: 'safari',
        pseudoActivityInterval: 20000
      },

      WebDriver_IE11: {
        base: 'WebDriver',
        config: {hostname: 'localhost', port: 4446},
        browserName: 'internet explorer',
        pseudoActivityInterval: 20000
      },
    },

    browserStack: {
      // Always start a tunnel if using BrowserStack.  This used to be default,
      // but is now required as an explicit parameter.
      startTunnel: true
    },

    // By default, use Chrome only, unless command-line arguments override.
    browsers: ['Chrome'],
  });

  if (flagPresent('html-coverage-report')) {
    // Wipe out any old coverage reports to avoid confusion.
    var rimraf = require('rimraf');
    rimraf.sync('coverage', {});  // Like rm -rf

    config.set({
      reporters: [ 'coverage', 'progress' ],
      coverageReporter: {
        reporters: [
          { type: 'html', dir: 'coverage' },
        ],
      },
    });
  }

  if (!flagPresent('quick')) {
    var files = config.files;
    files.push('test/*_integration.js');
    // We just modified the config in-place.  No need for config.set().
  }

  var logLevel = getFlagValue('enable-logging');
  if (logLevel !== null) {
    if (logLevel === '')
      logLevel = 3;  // INFO

    config.set({
      reporters: ['spec'],
    });
    // Setting |config.client| using config.set will remove the
    // |config.client.args| member.
    config.client.captureConsole = true;
    setClientArg(config, 'logLevel', logLevel);
  }
};

// Sets the value of an argument passed to the client.
function setClientArg(config, name, value) {
  config.client.args[0][name] = value;
}

// Find a custom command-line flag that has a value (e.g. --option=12).
// Returns:
// * string value  --option=12
// * empty string  --option= or --option
// * null          not present
function getFlagValue(name) {
  var re = /^--([^=]+)(?:=(.*))?$/;
  for (var i = 0; i < process.argv.length; i++) {
    var match = re.exec(process.argv[i]);
    if (match && match[1] == name) {
      if (match[2] !== undefined)
        return match[2];
      else
        return '';
    }
  }

  return null;
}

// Find custom command-line flags.
function flagPresent(name) {
  return getFlagValue(name) !== null;
}

// Construct framework plugins on-the-fly for arbitrary node modules.
// A call to this must be placed in the config in the 'plugins' array,
// and the module name must be added to the config in the 'frameworks' array.
function frameworkPluginForModule(name) {
  // The framework injects files into the client which runs the tests.
  var framework = function(files) {
    // Locate the main file for the node module.
    var path = require('path');
    var mainFile = path.resolve(require.resolve(name));

    // Add a file entry to the list of files to be served.
    // This follows the same syntax as above in config.set({files: ...}).
    files.unshift({
      pattern: mainFile, included: true, served: true, watched: false
    });
  };

  // The framework factory function takes one argument, which is the list of
  // files from the karma config.
  framework.$inject = ['config.files'];

  // This is the plugin interface to register a new framework.  Adding this to
  // the list of plugins makes the named module available as a framework.  That
  // framework then injects the module into the client.
  var obj = {};
  obj['framework:' + name] = ['factory', framework];
  return obj;
}
