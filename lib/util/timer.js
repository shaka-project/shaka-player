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

goog.provide('shaka.util.Timer');



/**
 * A simple cancelable timer.
 * @param {Function} callback
 * @constructor
 * @struct
 */
shaka.util.Timer = function(callback) {
  /** @private {?number} */
  this.id_ = null;

  /** @private {Function} */
  this.callback_ = (function() {
    this.id_ = null;
    callback();
  }.bind(this));
};


/**
 * Cancel the timer, if it's running.
 */
shaka.util.Timer.prototype.cancel = function() {
  if (this.id_ != null) {
    clearTimeout(this.id_);
    this.id_ = null;
  }
};


/**
 * Schedule the timer, canceling any previous scheduling.
 * @param {number} seconds
 */
shaka.util.Timer.prototype.schedule = function(seconds) {
  this.cancel();
  this.id_ = setTimeout(this.callback_, seconds * 1000);
};


/**
 * Schedule the timer, canceling any previous scheduling. The timer will
 * automatically reschedule after the callback fires.
 * @param {number} seconds
 */
shaka.util.Timer.prototype.scheduleRepeated = function(seconds) {
  this.cancel();
  let repeat = (function() {
    this.callback_();
    this.id_ = setTimeout(repeat, seconds * 1000);
  }.bind(this));
  this.id_ = setTimeout(repeat, seconds * 1000);
};
