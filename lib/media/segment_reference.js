/**
 * @license
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
 */

goog.provide('shaka.media.SegmentReference');

goog.require('shaka.asserts');
goog.require('shaka.util.FailoverUri');



/**
 * Creates a SegmentReference, which is a reference to some media segment.
 *
 * @param {number} startTime The time, in seconds, that the segment begins.
 * @param {?number} endTime The time, in seconds, that the segment ends. The
 *     segment ends immediately before this time. A null value indicates that
 *     the segment continues to the end of the stream.
 * @param {!shaka.util.FailoverUri} url The failover url of the media segment.
 * @constructor
 * @struct
 */
shaka.media.SegmentReference = function(startTime, endTime, url) {
  shaka.asserts.assert((endTime == null) || (startTime <= endTime),
                       'startTime should be <= endTime');

  /**
   * The time, in seconds, that the segment begins.
   * @const {number}
   */
  this.startTime = startTime;

  /**
   * The time, in seconds, that the segment ends. The segment ends immediately
   * before this time. A null value indicates that the segment continues to the
   * end of the stream.
   * @const {?number}
   */
  this.endTime = endTime;

  /**
   * The segment's location.
   * @const {!shaka.util.FailoverUri}
   */
  this.url = url;
};


/**
 * Creates a new SegmentReference with an adjusted start time and an adjusted
 * end time.
 *
 * @param {number} startTime
 * @param {?number} endTime
 * @return {!shaka.media.SegmentReference}
 */
shaka.media.SegmentReference.prototype.adjust = function(startTime, endTime) {
  return new shaka.media.SegmentReference(
      startTime,
      endTime,
      this.url);
};


/**
 * Gets the index into |references| of the SegmentReference corresponding to
 * the specified time.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {number} time The time in seconds.
 * @return {number} The index of the SegmentReference for the specified time,
 *     or -1 if no such SegmentReference exists.
 */
shaka.media.SegmentReference.find = function(references, time) {
  // For live streams, searching from the end is faster. For VOD, it balances
  // out either way. In both cases, references.length is small enough that the
  // difference isn't huge.
  for (var i = references.length - 1; i >= 0; --i) {
    var r = references[i];
    // Note that a segment ends immediately before the end time.
    if ((time >= r.startTime) && (r.endTime == null || time < r.endTime)) {
      return i;
    }
  }
  return -1;
};


/**
 * Shifts each SegmentReference in time by |delta| seconds.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {number} delta
 * @return {!Array.<!shaka.media.SegmentReference>} The shifted
 *     SegmentReferences.
 */
shaka.media.SegmentReference.shift = function(references, delta) {
  return references.map(
      function(r) {
        return r.adjust(r.startTime + delta,
                        r.endTime != null ? r.endTime + delta : null);
      });
};


/**
 * Asserts that |references| are sorted by their start times without gaps and
 * have unique start times.
 *
 * For debugging purposes.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 */
shaka.media.SegmentReference.assertCorrectReferences = function(references) {
  if (!COMPILED) {
    var previous = references[0];
    for (var i = 1; i < references.length; ++i) {
      var r = references[i];
      var ok = (r.startTime > previous.startTime) &&
               (r.startTime <= previous.endTime) &&
               ((r.endTime && r.endTime >= previous.endTime) ||
                (i == references.length - 1));
      shaka.asserts.assert(ok, 'SegmentReferences are not correct.');
      if (!ok) {
        shaka.log.debug(
            'SegmentReferences should be sorted without gaps:',
            'previous', previous, 'current', r);
      }
      previous = r;
    }
  }
};
