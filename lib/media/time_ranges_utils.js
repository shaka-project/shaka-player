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

goog.require('shaka.util.Platform');


/**
 * @namespace shaka.media.TimeRangesUtils
 * @summary A set of utility functions for dealing with TimeRanges objects.
 */


/**
 * Gets the first timestamp in the buffer.
 *
 * @param {TimeRanges} b
 * @return {?number} The first buffered timestamp, in seconds, if |buffered|
 *   is non-empty; otherwise, return null.
 */
shaka.media.TimeRangesUtils.bufferStart = function(b) {
  if (!b) return null;
  // Workaround Safari bug: https://bit.ly/2trx6O8
  if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) return null;
  // Workaround Edge bug: https://bit.ly/2JYLPeB
  if (b.length == 1 && b.start(0) < 0) return 0;
  return b.length ? b.start(0) : null;
};


/**
 * Gets the last timestamp in the buffer.
 *
 * @param {TimeRanges} b
 * @return {?number} The last buffered timestamp, in seconds, if |buffered|
 *   is non-empty; otherwise, return null.
 */
shaka.media.TimeRangesUtils.bufferEnd = function(b) {
  if (!b) return null;
  // Workaround Safari bug: https://bit.ly/2trx6O8
  if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) return null;
  return b.length ? b.end(b.length - 1) : null;
};


/**
 * Determines if the given time is inside a buffered range.  This includes gaps,
 * meaning that if the playhead is in a gap, it is considered buffered. If there
 * is a small gap between the playhead and buffer start, consider it as
 * buffered.
 *
 * @param {TimeRanges} b
 * @param {number} time Playhead time
 * @param {number=} smallGapLimit Set in configuration
 * @return {boolean}
 */
shaka.media.TimeRangesUtils.isBuffered = function(b, time, smallGapLimit = 0) {
  if (!b || !b.length) return false;
  // Workaround Safari bug: https://bit.ly/2trx6O8
  if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) return false;

  if (time > b.end(b.length - 1)) {
    return false;
  }
  // Push the time forward by the gap limit so that it is more likely to be in
  // the range.
  return (time + smallGapLimit >= b.start(0));
};


/**
 * Computes how far ahead of the given timestamp is buffered.  To provide smooth
 * playback while jumping gaps, we don't include the gaps when calculating this.
 * This only includes the amount of content that is buffered.
 *
 * @param {TimeRanges} b
 * @param {number} time
 * @return {number} The number of seconds buffered, in seconds, ahead of the
 *   given time.
 */
shaka.media.TimeRangesUtils.bufferedAheadOf = function(b, time) {
  if (!b || !b.length) return 0;
  // Workaround Safari bug: https://bit.ly/2trx6O8
  if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) return 0;

  // NOTE: On IE11, buffered ranges may show appended data before the associated
  // append operation is complete.

  // We calculate the buffered amount by ONLY accounting for the content
  // buffered (i.e. we ignore the times of the gaps).  We also buffer through
  // all gaps.
  // Therefore, we start at the end and add up all buffers until |time|.
  let result = 0;
  for (let i = b.length - 1; i >= 0 && b.end(i) > time; --i) {
    result += b.end(i) - Math.max(b.start(i), time);
  }

  return result;
};


/**
 * Determines if the given time is inside a gap between buffered ranges.  If it
 * is, this returns the index of the buffer that is *ahead* of the gap.
 *
 * @param {TimeRanges} b
 * @param {number} time
 * @return {?number} The index of the buffer after the gap, or null if not in a
 *   gap.
 */
shaka.media.TimeRangesUtils.getGapIndex = function(b, time) {
  const Platform = shaka.util.Platform;

  if (!b || !b.length) return null;
  // Workaround Safari bug: https://bit.ly/2trx6O8
  if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) return null;

  // Some browsers will stop earlier than others before a gap (e.g. IE/Edge
  // stops 0.5 seconds before a gap). So for some browsers we need to use a
  // larger threshold. See: https://bit.ly/2K5xmJO
  const useLargeThreshold = Platform.isEdge() ||
                            Platform.isIE() ||
                            Platform.isTizen() ||
                            Platform.isChromecast();

  const threshold = useLargeThreshold ? 0.5 : 0.1;

  for (let i = 0; i < b.length; i++) {
    if (b.start(i) > time && (i == 0 || b.end(i - 1) - time <= threshold)) {
      return i;
    }
  }

  return null;
};


/**
 * @param {TimeRanges} b
 * @return {!Array.<shaka.extern.BufferedRange>}
 */
shaka.media.TimeRangesUtils.getBufferedInfo = function(b) {
  if (!b) return [];
  let ret = [];
  for (let i = 0; i < b.length; i++) {
    ret.push({start: b.start(i), end: b.end(i)});
  }
  return ret;
};
