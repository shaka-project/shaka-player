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

      // actual tests last
      'test/*.js',

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

    // do not panic about "no activity" unless a test takes longer than 90s.
    browserNoActivityTimeout: 90000,

    // don't capture the client's console logs
    client: { captureConsole: true },

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
      BrowserStack_IE11: {
        base: 'BrowserStack',
        browser: 'ie',
        browser_version: '11.0',
        os: 'Windows',
        os_version: '8.1',
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
};

// Find custom command-line flags.
function flagPresent(name) {
  return process.argv.indexOf('--' + name) >= 0;
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
