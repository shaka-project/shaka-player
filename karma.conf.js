// Karma configuration
// Install required modules by running "npm install"

module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine-ajax', 'jasmine'],

    // list of files / patterns to load in the browser
    files: [
      // closure base first
      'third_party/closure/goog/base.js',

      // deps next
      'dist/deps.js',

      // test utils next
      'spec/*util.js',

      // actual tests last
      'spec/*.js',

      // source files - these are only watched and served
      {pattern: 'lib/**/*.js', included: false},
      {pattern: 'spec/assets/*', included: false},
      {pattern: 'third_party/closure/goog/**/*.js', included: false},
    ],

    proxies: {
      '/spec/assets/': '/base/spec/assets/',
    },

    preprocessors: {
      // Don't compute coverage over lib/debug/ or lib/polyfill/
      'lib/!(debug|polyfill)/*.js': 'coverage',
    },

    coverageReporter: {
      reporters: [
        { type: 'text' },
      ],
    },

    // do not panic about "no activity" unless a test takes longer than 60s.
    browserNoActivityTimeout: 60000,

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

    customLaunchers: {
      // Firefox doesn't enable MediaSource Extensions or MP4 by default yet:
      FirefoxWithMSE: {
        base: 'Firefox',
        prefs: {
          'media.fragmented-mp4.exposed': true,
          'media.fragmented-mp4.ffmpeg.enabled': true,
          'media.mediasource.enabled': true,
          'media.mediasource.format-reader': true,
          'media.mediasource.webm.enabled': true,
          'media.mediasource.whitelist': false,
          'media.mediasource.youtubeonly': false,
        },
      },
    },

    // By default, use Chrome only, unless command-line arguments override.
    browsers: ['Chrome'],
  });

  // Process custom command-line flags.
  function flagPresent(name) {
    return process.argv.indexOf('--' + name) >= 0;
  }

  if (flagPresent('html-coverage-report')) {
    // Wipe out any old coverage reports to avoid confusion.
    var rimraf = require('rimraf');
    rimraf.sync('coverage', {});  // Like rm -rf

    config.set({
      reporters: [ 'coverage' ],
      coverageReporter: {
        reporters: [
          { type: 'html', dir: 'coverage' },
        ],
      },
    });
  }
};
