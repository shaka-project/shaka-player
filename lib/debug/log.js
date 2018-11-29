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

goog.provide('shaka.log');


/**
 * @namespace shaka.log
 * @summary
 * A console logging framework which is compiled out for deployment.  This is
 * only available when using the uncompiled version.
 * @exportDoc
 */


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
goog.define('shaka.log.MAX_LOG_LEVEL', 3);


/**
 * This always logs to the console, even in Release mode.  This should only be
 * used for deprecation messages and things the app should never ignore.
 *
 * @type {function(*, ...*)}
 */
shaka.log.alwaysError = function() {};


/**
 * This always logs to the console, even in Release mode.  This should only be
 * used for deprecation messages and things the app should never ignore.
 *
 * @type {function(*, ...*)}
 */
shaka.log.alwaysWarn = function() {};


/**
 * This log is for when an error occurs.  This should always be accompanied with
 * an error event, thrown exception, or rejected Promise.  Logs are disabled in
 * Release mode, so there should be other methods of detecting the error.
 *
 * @type {function(*, ...*)}
 */
shaka.log.error = function() {};


/**
 * This log is for possible errors or things that may be surprising to a user.
 * For example, if we work around unusual or bad content, we should warn that
 * they should fix their content.  Deprecation messages and messages the app
 * shouldn't ignore should use alwaysWarn instead.
 *
 * @type {function(*, ...*)}
 */
shaka.log.warning = function() {};


/**
 * This log is for messages to the user about what is happening.  For example,
 * when we update a manifest or install a polyfill.
 *
 * @type {function(*, ...*)}
 */
shaka.log.info = function() {};


/**
 * This log is to aid *users* in debugging their content.  This should be for
 * logs about the content and what we do with it.  For example, when we change
 * streams or what we are choosing.
 *
 * @type {function(*, ...*)}
 */
shaka.log.debug = function() {};


/**
 * This log is for debugging Shaka Player itself.  This may be logs about
 * internal states or events.  This may also be for more verbose logs about
 * content, such as for segment appends.
 *
 * @type {function(*, ...*)}
 */
shaka.log.v1 = function() {};


/**
 * This log is for tracing and debugging Shaka Player.  These logs will happen
 * a lot, for example, logging every segment append or every update check.
 * These are mostly used for tracking which calls happen through the code.
 *
 * @type {function(*, ...*)}
 */
shaka.log.v2 = function() {};


// IE8 has no console unless it is opened in advance.
// IE9 console methods are not Functions and have no bind.
if (window.console && window.console.log.bind) {
  shaka.log.alwaysWarn = console.warn.bind(console);
  shaka.log.alwaysError = console.error.bind(console);

  if (goog.DEBUG) {
    /** @type {number} */
    shaka.log.currentLevel;

    /**
     * Change the log level.  Useful for debugging in uncompiled mode.
     *
     * @param {number} level
     * @exportDoc
     */
    shaka.log.setLevel = function(level) {
      let nop = function() {};
      let log = shaka.log;
      const Level = shaka.log.Level;

      shaka.log.currentLevel = level;

      log.error = (level >= Level.ERROR) ? console.error.bind(console) : nop;
      log.warning = (level >= Level.WARNING) ? console.warn.bind(console) : nop;
      log.info = (level >= Level.INFO) ? console.info.bind(console) : nop;
      log.debug = (level >= Level.DEBUG) ? console.log.bind(console) : nop;
      log.v1 = (level >= Level.V1) ? console.debug.bind(console) : nop;
      log.v2 = (level >= Level.V2) ? console.debug.bind(console) : nop;
    };

    shaka.log.setLevel(shaka.log.MAX_LOG_LEVEL);
  } else {
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.ERROR) {
      shaka.log.error = console.error.bind(console);
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.WARNING) {
      shaka.log.warning = console.warn.bind(console);
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.INFO) {
      shaka.log.info = console.info.bind(console);
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.DEBUG) {
      shaka.log.debug = console.log.bind(console);
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.V1) {
      shaka.log.v1 = console.debug.bind(console);
    }
    if (shaka.log.MAX_LOG_LEVEL >= shaka.log.Level.V2) {
      shaka.log.v2 = console.debug.bind(console);
    }
  }
}
