/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.log');

goog.require('goog.asserts');

/**
 * @summary
 * A console logging framework which is compiled out for deployment.  This is
 * only available when using the uncompiled version.
 * @exportDoc
 */
shaka.log = class {
  /**
   * This always logs to the console, even in Release mode.  This should only be
   * used for deprecation messages and things the app should never ignore.
   *
   * @param {...*} args
   */
  static alwaysError(...args) {}

  /**
   * This always logs to the console, even in Release mode.  This should only be
   * used for deprecation messages and things the app should never ignore.
   *
   * @param {...*} args
   */
  static alwaysWarn(...args) {}

  /**
   * This always logs to the console, even in Release mode.  This should only be
   * used for deprecation messages and things the app should never ignore.
   *
   * @param {string} id
   * @param {...*} args
   */
  static warnOnce(id, ...args) {
    if (shaka.log.oneTimeWarningIssued_.has(id)) {
      return;
    }

    shaka.log.oneTimeWarningIssued_.add(id);
    shaka.log.alwaysWarn(...args);
  }

  /**
   * This log is for when an error occurs.  This should always be accompanied
   * with an error event, thrown exception, or rejected Promise.  Logs are
   * disabled in Release mode, so there should be other methods of detecting the
   * error.
   *
   * @param {...*} args
   */
  static error(...args) {}

  /**
   * This log is for possible errors or things that may be surprising to a user.
   * For example, if we work around unusual or bad content, we should warn that
   * they should fix their content.  Deprecation messages and messages the app
   * shouldn't ignore should use alwaysWarn instead.
   *
   * @param {...*} args
   */
  static warning(...args) {}

  /**
   * This log is for messages to the user about what is happening.  For example,
   * when we update a manifest or install a polyfill.
   *
   * @param {...*} args
   */
  static info(...args) {}

  /**
   * This log is to aid *users* in debugging their content.  This should be for
   * logs about the content and what we do with it.  For example, when we change
   * streams or what we are choosing.
   *
   * @param {...*} args
   */
  static debug(...args) {}

  /**
   * This log is for debugging Shaka Player itself.  This may be logs about
   * internal states or events.  This may also be for more verbose logs about
   * content, such as for segment appends.
   *
   * @param {...*} args
   */
  static v1(...args) {}

  /**
   * This log is for tracing and debugging Shaka Player.  These logs will happen
   * a lot, for example, logging every segment append or every update check.
   * These are mostly used for tracking which calls happen through the code.
   *
   * @param {...*} args
   */
  static v2(...args) {}
};


/**
 * Log levels.
 * @enum {number}
 * @exportDoc
 */
shaka.log.Level = {
  NONE: 0,
  ERROR: 1,
  WARNING: 2,
  INFO: 3,
  DEBUG: 4,
  V1: 5,
  V2: 6,
};


/**
 * @define {number} the maximum log level.
 */
shaka.log.MAX_LOG_LEVEL = 3;


/**
 * A Set to indicate which one-time warnings have been issued.
 *
 * @private {!Set.<string>}
 */
shaka.log.oneTimeWarningIssued_ = new Set();


// IE8 has no console unless it is opened in advance.
// IE9 console methods are not Functions and have no bind.
if (window.console && window.console.log.bind) {
  /** @private {!Object.<shaka.log.Level, function(...*)>} */
  shaka.log.logMap_ = {
    /* eslint-disable no-restricted-syntax */
    [shaka.log.Level.ERROR]: console.error.bind(console),
    [shaka.log.Level.WARNING]: console.warn.bind(console),
    [shaka.log.Level.INFO]: console.info.bind(console),
    [shaka.log.Level.DEBUG]: console.log.bind(console),
    [shaka.log.Level.V1]: console.debug.bind(console),
    [shaka.log.Level.V2]: console.debug.bind(console),
    /* eslint-enable no-restricted-syntax */
  };

  shaka.log.alwaysWarn = shaka.log.logMap_[shaka.log.Level.WARNING];
  shaka.log.alwaysError = shaka.log.logMap_[shaka.log.Level.ERROR];

  if (goog.DEBUG) {
    // Since we don't want to export shaka.log in production builds, we don't
    // use the @export annotation.  But the module wrapper (used in debug builds
    // since v2.5.11) hides anything non-exported.  This is a debug-only,
    // API-based export to make sure logging is available in debug builds.
    goog.exportSymbol('shaka.log', shaka.log);

    /** @type {number} */
    shaka.log.currentLevel;

    /**
     * Change the log level.  Useful for debugging in uncompiled mode.
     *
     * @param {number} level
     * @exportDoc
     */
    shaka.log.setLevel = (level) => {
      const getLog = (curLevel) => {
        if (curLevel <= level) {
          goog.asserts.assert(
              shaka.log.logMap_[curLevel], 'Unexpected log level');
          return shaka.log.logMap_[curLevel];
        } else {
          return () => {};
        }
      };

      shaka.log.currentLevel = level;
      shaka.log.error = getLog(shaka.log.Level.ERROR);
      shaka.log.warning = getLog(shaka.log.Level.WARNING);
      shaka.log.info = getLog(shaka.log.Level.INFO);
      shaka.log.debug = getLog(shaka.log.Level.DEBUG);
      shaka.log.v1 = getLog(shaka.log.Level.V1);
      shaka.log.v2 = getLog(shaka.log.Level.V2);
    };

    shaka.log.setLevel(shaka.log.MAX_LOG_LEVEL);
  } else {
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.ERROR) {
      shaka.log.error = shaka.log.logMap_[shaka.log.Level.ERROR];
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.WARNING) {
      shaka.log.warning = shaka.log.logMap_[shaka.log.Level.WARNING];
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.INFO) {
      shaka.log.info = shaka.log.logMap_[shaka.log.Level.INFO];
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.DEBUG) {
      shaka.log.debug = shaka.log.logMap_[shaka.log.Level.DEBUG];
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.V1) {
      shaka.log.v1 = shaka.log.logMap_[shaka.log.Level.V1];
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.V2) {
      shaka.log.v2 = shaka.log.logMap_[shaka.log.Level.V2];
    }
  }
}
