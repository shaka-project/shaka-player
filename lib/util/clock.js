/**
 * Copyright 2015 Google Inc.
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
 *
 * @fileoverview A synchronizable clock.
 */

goog.provide('shaka.util.Clock');


/**
 * @namespace shaka.util.Clock
 * @summary A synchronizable clock.
 */


/**
 * Sync the clock.
 *
 * @param {number} timestamp A timestamp in milliseconds which should be the
 *     current time.
 */
shaka.util.Clock.sync = function(timestamp) {
  shaka.util.Clock.offset_ = timestamp - Date.now();
};


/**
 * @return {number} The current time in milliseconds.
 */
shaka.util.Clock.now = function() {
  return Date.now() + shaka.util.Clock.offset_;
};


/**
 * @private {number} The clock offset in milliseconds.
 */
shaka.util.Clock.offset_ = 0;

