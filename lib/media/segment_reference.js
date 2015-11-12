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



/**
 * Creates a SegmentReference.
 *
 * @param {number} startTime The segment's start time in seconds.
 * @param {number} endTime The segment's end time in seconds. The segment ends
 *     the instant before this time.
 * @param {!Array.<string>} uris The URIs of the resource containing the
 *     segment.
 * @param {number} startByte The offset from the start of the resource to the
 *     start of the segment.
 * @param {?number} endByte The offset from the start of the resource to the
 *     end of the segment, inclusive. null indicates that the segment extends
 *     to the end of the resource.
 *
 * @constructor
 * @struct
 */
shaka.media.SegmentReference = function(
    startTime, endTime, uris, startByte, endByte) {
  shaka.asserts.assert(startTime < endTime,
                       'startTime must be less than endTime');
  shaka.asserts.assert((startByte < endByte) || (endByte == null),
                       'startByte must be < endByte');

  /** @const {number} */
  this.startTime = startTime;

  /** @const {number} */
  this.endTime = endTime;

  /** @const {!Array.<string>} */
  this.uris = uris;

  /** @const {number} */
  this.startByte = startByte;

  /** @const {?number} */
  this.endByte = endByte;
};


/**
 * Returns the SegmentReference for the specified time. If more than one
 * SegmentReference exists for the specified time then returns the one with the
 * largest index.
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
    if ((time >= r.startTime) && (time < r.endTime)) {
      return i;
    }
  }
  return -1;
};

