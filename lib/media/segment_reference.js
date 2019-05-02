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

goog.provide('shaka.media.InitSegmentReference');
goog.provide('shaka.media.SegmentReference');

goog.require('goog.asserts');


/**
 * Creates an InitSegmentReference, which provides the location to an
 * initialization segment.
 *
 * @param {function():!Array.<string>} uris A function that creates the URIs of
 *   the resource containing the segment.
 * @param {number} startByte The offset from the start of the resource to the
 *   start of the segment.
 * @param {?number} endByte The offset from the start of the resource to the
 *   end of the segment, inclusive.  A value of null indicates that the segment
 *   extends to the end of the resource.
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.InitSegmentReference = function(uris, startByte, endByte) {
  /** @type {function():!Array.<string>} */
  this.getUris = uris;

  /** @const {number} */
  this.startByte = startByte;

  /** @const {?number} */
  this.endByte = endByte;
};


/**
 * Creates the URIs of the resource containing the segment.
 *
 * @return {!Array.<string>}
 * @export
 */
shaka.media.InitSegmentReference.prototype.createUris = function() {
  return this.getUris();
};


/**
 * Returns the offset from the start of the resource to the
 * start of the segment.
 *
 * @return {number}
 * @export
 */
shaka.media.InitSegmentReference.prototype.getStartByte = function() {
  return this.startByte;
};


/**
 * Returns the offset from the start of the resource to the end of the segment,
 * inclusive.  A value of null indicates that the segment extends to the end of
 * the resource.
 *
 * @return {?number}
 * @export
 */
shaka.media.InitSegmentReference.prototype.getEndByte = function() {
  return this.endByte;
};


/**
 * Returns the size of the init segment.
 * @return {?number}
 */
shaka.media.InitSegmentReference.prototype.getSize = function() {
  if (this.endByte) {
    return this.endByte - this.startByte;
  } else {
    return null;
  }
};


/**
 * Creates a SegmentReference, which provides the start time, end time, and
 * location to a media segment.
 *
 * @param {number} position The segment's position within a particular Period.
 *   The following should hold true between any two SegmentReferences from the
 *   same Period, r1 and r2:
 *   IF r2.position > r1.position THEN
 *     [ (r2.startTime > r1.startTime) OR
 *       (r2.startTime == r1.startTime AND r2.endTime >= r1.endTime) ]
 * @param {number} startTime The segment's start time in seconds, relative to
 *   the start of a particular Period.
 * @param {number} endTime The segment's end time in seconds, relative to
 *   the start of a particular Period.  The segment ends the instant before
 *   this time, so |endTime| must be strictly greater than |startTime|.
 * @param {function():!Array.<string>} uris
 *   A function that creates the URIs of the resource containing the segment.
 * @param {number} startByte The offset from the start of the resource to the
 *   start of the segment.
 * @param {?number} endByte The offset from the start of the resource to the
 *   end of the segment, inclusive.  A value of null indicates that the segment
 *   extends to the end of the resource.
 *
 * @constructor
 * @struct
 * @export
 */
shaka.media.SegmentReference = function(
    position, startTime, endTime, uris, startByte, endByte) {
  goog.asserts.assert(startTime < endTime,
                      'startTime must be less than endTime');
  goog.asserts.assert((startByte < endByte) || (endByte == null),
                      'startByte must be < endByte');
  /** @const {number} */
  this.position = position;

  /** @type {number} */
  this.startTime = startTime;

  /** @type {number} */
  this.endTime = endTime;

  /** @type {function():!Array.<string>} */
  this.getUris = uris;

  /** @const {number} */
  this.startByte = startByte;

  /** @const {?number} */
  this.endByte = endByte;
};


/**
 * Returns the segment's position within a particular Period.
 *
 * @return {number} The segment's position.
 * @export
 */
shaka.media.SegmentReference.prototype.getPosition = function() {
  return this.position;
};


/**
 * Returns the segment's start time in seconds, relative to
 * the start of a particular Period.
 *
 * @return {number}
 * @export
 */
shaka.media.SegmentReference.prototype.getStartTime = function() {
  return this.startTime;
};


/**
 * Returns the segment's end time in seconds, relative to
 * the start of a particular Period.
 *
 * @return {number}
 * @export
 */
shaka.media.SegmentReference.prototype.getEndTime = function() {
  return this.endTime;
};


/**
 * Creates the URIs of the resource containing the segment.
 *
 * @return {!Array.<string>}
 * @export
 */
shaka.media.SegmentReference.prototype.createUris = function() {
  return this.getUris();
};


/**
 * Returns the offset from the start of the resource to the
 * start of the segment.
 *
 * @return {number}
 * @export
 */
shaka.media.SegmentReference.prototype.getStartByte = function() {
  return this.startByte;
};


/**
 * Returns the offset from the start of the resource to the end of the segment,
 * inclusive.  A value of null indicates that the segment extends to the end of
 * the resource.
 *
 * @return {?number}
 * @export
 */
shaka.media.SegmentReference.prototype.getEndByte = function() {
  return this.endByte;
};


/**
 * Returns the size of the segment.
 * @return {?number}
 */
shaka.media.SegmentReference.prototype.getSize = function() {
  if (this.endByte) {
    return this.endByte - this.startByte;
  } else {
    return null;
  }
};


/**
 * A convenient typedef for when either type of reference is acceptable.
 *
 * @typedef {shaka.media.InitSegmentReference|shaka.media.SegmentReference}
 */
shaka.media.AnySegmentReference;
