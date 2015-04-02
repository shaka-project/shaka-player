/**
 * Copyright 2014 Google Inc.
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
 * @fileoverview Implements a segment reference structure.
 */

goog.provide('shaka.media.SegmentReference');

goog.require('goog.Uri');



/**
 * Creates a SegmentReference, which is a reference to some media segment.
 *
 * @param {number} id The segment's ID.
 * @param {number} startTime The time, in seconds, that the segment begins.
 * @param {?number} endTime The time, in seconds, that the segment ends. The
 *     segment ends immediately before this time. A null value indicates that
 *     the segment continues to the end of the stream.
 * @param {number} startByte The position of the segment's first byte.
 * @param {?number} endByte The position of the segment's last byte, inclusive.
 *     A null value indicates that the segment continues to the end of the
 *     file located at |url|.
 * @param {!goog.Uri} url The segment's location.
 * @constructor
 * @struct
 */
shaka.media.SegmentReference = function(
    id, startTime, endTime, startByte, endByte, url) {
  shaka.asserts.assert((endTime == null) || (startTime <= endTime),
                       'startTime should be <= endTime');

  /**
   * The segment's ID.
   * @const {number}
   */
  this.id = id;

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
   * The position of the segment's first byte.
   * @const {number}
   */
  this.startByte = startByte;

  /**
   * The position of the segment's last byte, inclusive. A null value indicates
   * that the segment continues to the end of the file located at |url|.
   * @const {?number}
   */
  this.endByte = endByte;

  /**
   * The segment's location.
   * @const {!goog.Uri}
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
      this.id,
      startTime,
      endTime,
      this.startByte,
      this.endByte,
      this.url);
};

