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

  /** @private {number} */
  this.timeoutSeconds_ = 0;

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
  this.timeoutSeconds_ = seconds;
  this.id_ = setTimeout(this.callback_, seconds * 1000);
};


/**
 * If the timer is running, reschedule it using the previous scheduled timeout.
 * @example
 *   If scheduled for 5 seconds, and rescheduled 3 seconds later,
 *   the timer will fire 8 seconds after the original scheduling.
 * @example
 *   If scheduled for 5 seconds, and rescheduled 6 seconds later,
 *   the timer will already have fired and will not be rescheduled.
 */
shaka.util.Timer.prototype.rescheduleIfRunning = function() {
  if (this.id_ != null) {
    this.schedule(this.timeoutSeconds_);
  }
};
