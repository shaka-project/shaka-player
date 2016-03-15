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

goog.provide('shaka.media.TimeRangesUtils');


/**
 * @namespace shaka.media.TimeRangesUtils
 * @exportDoc
 * @summary A set of utility functions for dealing with TimeRanges objects.
 */


/**
 * Gets the first timestamp in buffer.
 *
 * @param {TimeRanges} b
 * @return {?number} The first buffered timestamp, in seconds, if |buffered|
 *   is non-empty; otherwise, return null.
 */
shaka.media.TimeRangesUtils.bufferStart = function(b) {
  if (!b) return null;
  return b.length ? b.start(0) : null;
};


/**
 * Gets the last timestamp in buffer.
 *
 * @param {TimeRanges} b
 * @return {?number} The last buffered timestamp, in seconds, if |buffered|
 *   is non-empty; otherwise, return null.
 */
shaka.media.TimeRangesUtils.bufferEnd = function(b) {
  if (!b) return null;
  return b.length ? b.end(b.length - 1) : null;
};


/**
 * Computes how far ahead of the given timestamp is buffered.
 *
 * @param {TimeRanges} buffered
 * @param {number} time
 * @return {number} The number of seconds buffered, in seconds, ahead of the
 *   given time.
 */
shaka.media.TimeRangesUtils.bufferedAheadOf = function(
    buffered, time) {
  if (!buffered) return 0;
  // NOTE: On IE11, buffered ranges may show appended data before the associated
  // append operation is complete.
  var fudge = 0.0001;  // 0.1ms
  // NOTE: The 0.1ms fudge is needed on Safari, where removal up to X may leave
  // a range which starts at X + 1us + some small epsilon.
  for (var i = 0; i < buffered.length; ++i) {
    if (time + fudge >= buffered.start(i) && time < buffered.end(i)) {
      return buffered.end(i) - time;
    }
  }
  return 0;
};

