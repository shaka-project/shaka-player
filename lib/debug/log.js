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
  V2: 6
};


/**
 * @define {number} the maximum log level.
 */
goog.define('shaka.log.MAX_LOG_LEVEL', 3);


/** @type {function(*, ...*)} */
shaka.log.error = function() {};


/** @type {function(*, ...*)} */
shaka.log.warning = function() {};


/** @type {function(*, ...*)} */
shaka.log.info = function() {};


/** @type {function(*, ...*)} */
shaka.log.debug = function() {};


/** @type {function(*, ...*)} */
shaka.log.v1 = function() {};


/** @type {function(*, ...*)} */
shaka.log.v2 = function() {};


// IE8 has no console unless it is opened in advance.
// IE9 console methods are not Functions and have no bind.
if (window.console && window.console.log.bind) {
  if (!COMPILED) {
    /** @type {number} */
    shaka.log.currentLevel;

    /**
     * Change the log level.  Useful for debugging in uncompiled mode.
     *
     * @param {number} level
     * @exportDoc
     */
    shaka.log.setLevel = function(level) {
      var nop = function() {};
      var log = shaka.log;
      var Level = shaka.log.Level;

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
