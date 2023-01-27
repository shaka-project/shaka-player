/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.TimeRangesUtils');


/**
 * @summary A set of utility functions for dealing with TimeRanges objects.
 */
shaka.media.TimeRangesUtils = class {
  /**
   * Gets the first timestamp in the buffer.
   *
   * @param {TimeRanges} b
   * @return {?number} The first buffered timestamp, in seconds, if |buffered|
   *   is non-empty; otherwise, return null.
   */
  static bufferStart(b) {
    if (!b) {
      return null;
    }
    // Workaround Safari bug: https://bit.ly/2trx6O8
    if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) {
      return null;
    }
    // Workaround Edge bug: https://bit.ly/2JYLPeB
    if (b.length == 1 && b.start(0) < 0) {
      return 0;
    }
    return b.length ? b.start(0) : null;
  }


  /**
   * Gets the last timestamp in the buffer.
   *
   * @param {TimeRanges} b
   * @return {?number} The last buffered timestamp, in seconds, if |buffered|
   *   is non-empty; otherwise, return null.
   */
  static bufferEnd(b) {
    if (!b) {
      return null;
    }
    // Workaround Safari bug: https://bit.ly/2trx6O8
    if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) {
      return null;
    }
    return b.length ? b.end(b.length - 1) : null;
  }


  /**
   * Determines if the given time is inside a buffered range.
   *
   * @param {TimeRanges} b
   * @param {number} time Playhead time
   * @return {boolean}
   */
  static isBuffered(b, time) {
    if (!b || !b.length) {
      return false;
    }
    // Workaround Safari bug: https://bit.ly/2trx6O8
    if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) {
      return false;
    }

    if (time > b.end(b.length - 1)) {
      return false;
    }

    return time >= b.start(0);
  }


  /**
   * Computes how far ahead of the given timestamp is buffered.  To provide
   * smooth playback while jumping gaps, we don't include the gaps when
   * calculating this.
   * This only includes the amount of content that is buffered.
   *
   * @param {TimeRanges} b
   * @param {number} time
   * @return {number} The number of seconds buffered, in seconds, ahead of the
   *   given time.
   */
  static bufferedAheadOf(b, time) {
    if (!b || !b.length) {
      return 0;
    }
    // Workaround Safari bug: https://bit.ly/2trx6O8
    if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) {
      return 0;
    }

    // We calculate the buffered amount by ONLY accounting for the content
    // buffered (i.e. we ignore the times of the gaps).  We also buffer through
    // all gaps.
    // Therefore, we start at the end and add up all buffers until |time|.
    let result = 0;
    for (const {start, end} of shaka.media.TimeRangesUtils.getBufferedInfo(b)) {
      if (end > time) {
        result += end - Math.max(start, time);
      }
    }

    return result;
  }


  /**
   * Determines if the given time is inside a gap between buffered ranges.  If
   * it is, this returns the index of the buffer that is *ahead* of the gap.
   *
   * @param {TimeRanges} b
   * @param {number} time
   * @param {number} threshold
   * @return {?number} The index of the buffer after the gap, or null if not in
   *   a gap.
   */
  static getGapIndex(b, time, threshold) {
    const TimeRangesUtils = shaka.media.TimeRangesUtils;

    if (!b || !b.length) {
      return null;
    }
    // Workaround Safari bug: https://bit.ly/2trx6O8
    if (b.length == 1 && b.end(0) - b.start(0) < 1e-6) {
      return null;
    }

    const idx = TimeRangesUtils.getBufferedInfo(b).findIndex((item, i, arr) => {
      return item.start > time &&
          (i == 0 || arr[i - 1].end - time <= threshold);
    });
    return idx >= 0 ? idx : null;
  }


  /**
   * @param {TimeRanges} b
   * @return {!Array.<shaka.extern.BufferedRange>}
   */
  static getBufferedInfo(b) {
    if (!b) {
      return [];
    }
    const ret = [];
    for (let i = 0; i < b.length; i++) {
      ret.push({start: b.start(i), end: b.end(i)});
    }
    return ret;
  }

  /**
   * This operation can be potentially EXPENSIVE and should only be done in
   * debug builds for debugging purposes.
   *
   * @param {TimeRanges} oldRanges
   * @param {TimeRanges} newRanges
   * @return {?shaka.extern.BufferedRange} The last added range,
   *   chronologically by presentation time.
   */
  static computeAddedRange(oldRanges, newRanges) {
    const TimeRangesUtils = shaka.media.TimeRangesUtils;

    if (!oldRanges || !oldRanges.length) {
      return null;
    }
    if (!newRanges || !newRanges.length) {
      return TimeRangesUtils.getBufferedInfo(newRanges).pop();
    }

    const newRangesReversed =
        TimeRangesUtils.getBufferedInfo(newRanges).reverse();
    const oldRangesReversed =
        TimeRangesUtils.getBufferedInfo(oldRanges).reverse();
    for (const newRange of newRangesReversed) {
      let foundOverlap = false;

      for (const oldRange of oldRangesReversed) {
        if (oldRange.end >= newRange.start && oldRange.end <= newRange.end) {
          foundOverlap = true;

          // If the new range goes beyond the corresponding old one, the
          // difference is newly-added.
          if (newRange.end > oldRange.end) {
            return {start: oldRange.end, end: newRange.end};
          }
        }
      }

      if (!foundOverlap) {
        return newRange;
      }
    }

    return null;
  }
};
