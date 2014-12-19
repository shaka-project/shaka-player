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
 * @fileoverview Implements a segment index.
 */

goog.provide('shaka.dash.SegmentIndex');

goog.require('shaka.asserts');
goog.require('shaka.dash.SegmentRange');
goog.require('shaka.dash.SegmentReference');



/**
 * Creates a SegmentIndex.
 *
 * @param {!Array.<!shaka.dash.SegmentReference>} references Sorted by time in
 *     ascending order.
 * @constructor
 */
shaka.dash.SegmentIndex = function(references) {
  /** @private {!Array.<!shaka.dash.SegmentReference>} */
  this.references_ = references;
};


/**
 * Gets the number of SegmentReferences.
 *
 * @return {number}
 */
shaka.dash.SegmentIndex.prototype.getNumReferences = function() {
  return this.references_.length;
};


/**
 * Gets the SegmentReference at the given index.
 *
 * @param {number} index
 * @return {shaka.dash.SegmentReference} The SegmentReference or null if |index|
 *     is out of range.
 */
shaka.dash.SegmentIndex.prototype.getReference = function(index) {
  if (index < 0 || index >= this.references_.length) {
    return null;
  }

  return this.references_[index];
};


/**
 * Gets the SegmentRange that contains the timestamps |startTime| and
 * |startTime| + |duration|.
 *
 * @param {number} startTime The starting time in seconds.
 * @param {number} duration The interval's duration in seconds.
 * @return {shaka.dash.SegmentRange} The SegmentRange or null if there are no
 *     segments.
 */
shaka.dash.SegmentIndex.prototype.getRangeForInterval =
    function(startTime, duration) {
  var beginIndex = this.findReferenceIndex(startTime);
  if (beginIndex < 0) {
    return null;
  }

  /** @type {!Array.<!shaka.dash.SegmentReference>} */
  var references = [];

  for (var i = beginIndex; i < this.references_.length; i++) {
    references.push(this.references_[i]);
    var endTime = this.references_[i].endTime;
    // Note: the end time is exclusive!
    if (!endTime || (endTime > startTime + duration)) {
      break;
    }
  }

  return new shaka.dash.SegmentRange(references);
};


/**
 * Gets the index of the SegmentReference for the specified time.
 *
 * @param {number} time The time in seconds.
 * @return {number} The index of the SegmentReference for the specified time.
 *     0 is returned if |time| is less than the first segment's time.  The
 *     index of the last SegmentReference is returned if |time| is greater than
 *     the last segment's time. -1 is returned if there are no segments.
 */
shaka.dash.SegmentIndex.prototype.findReferenceIndex = function(time) {
  for (var i = 0; i < this.references_.length; i++) {
    if (this.references_[i].startTime > time) {
      return i ? i - 1 : 0;
    }
  }

  // |time| is greater than the |startTime| field of all references, or there
  // are no references.
  return this.references_.length - 1;
};

