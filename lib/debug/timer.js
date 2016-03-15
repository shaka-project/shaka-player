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

goog.provide('shaka.timer');

goog.require('shaka.log');


/**
 * @namespace shaka.timer
 * @summary A performance timing framework.
 *   Used in both debugging and production builds.
 */


/**
 * Begins a timer.
 *
 * @param {string} name
 */
shaka.timer.begin = function(name) {
  shaka.timer.timers_[name] = {
    begin: shaka.timer.now_(),
    end: NaN
  };
};


/**
 * End a timer and log (debug) the elapsed time.
 * Does nothing if the timer has not begun.
 *
 * @param {string} name
 */
shaka.timer.end = function(name) {
  var record = shaka.timer.timers_[name];
  if (!record) {
    return;
  }

  record.end = shaka.timer.now_();
  var diff = record.end - record.begin;
  shaka.log.debug(name + ': ' + diff.toFixed(3) + 'ms');
};


/**
 * Log (debug) the diff between two or more completed timers and return it.
 * Does nothing if not all of the timers have begun.
 *
 * @param {string} name1
 * @param {string} name2
 * @param {...string} var_args
 * @return {number} The diff between the timers, or NaN if they have not all
 *   completed.
 */
shaka.timer.diff = function(name1, name2, var_args) {
  var t1 = shaka.timer.get(name1);
  var t2 = shaka.timer.get(name2);
  if (!t1 || !t2) {
    return NaN;
  }
  var diff = t1 - t2;
  var name = name1 + ' - ' + name2;

  for (var i = 2; i < arguments.length; ++i) {
    var name3 = arguments[i];
    var t3 = shaka.timer.get(name3);
    if (!t3) {
      return NaN;
    }
    diff -= t3;
    name += ' - ' + name3;
  }

  shaka.log.debug(name + ': ' + diff.toFixed(3) + 'ms');
  return diff;
};


/**
 * Query a timer.
 *
 * @param {string} name
 * @return {number} The elapsed time in milliseconds, if the timer is complete.
 *   Returns NaN if the timer doesn't exist or hasn't ended yet.
 */
shaka.timer.get = function(name) {
  var record = shaka.timer.timers_[name];
  if (!record || !record.end) {
    return NaN;
  }

  return record.end - record.begin;
};


/** @private {function():number} */
shaka.timer.now_ = window.performance && window.performance.now ?
                       window.performance.now.bind(window.performance) :
                       Date.now;


/** @private {!Object.<string, {begin: number, end: number}>} */
shaka.timer.timers_ = {};
